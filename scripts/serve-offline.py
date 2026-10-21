#!/usr/bin/env python3
"""Serve a built CTM site with exam headers, static gzip and byte ranges.

Standard-library-only dry-run/CI server. Production exam deployment still needs
a trusted TLS certificate and the real browser/configuration dry run.
"""
import argparse
from functools import partial
import hashlib
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
import ssl
from urllib.parse import unquote, urlsplit

COMPRESSIBLE = {".wasm", ".js", ".mjs", ".json", ".css"}
MIME = {".wasm": "application/wasm", ".mjs": "text/javascript",
        ".js": "text/javascript", ".whl": "application/octet-stream",
        ".zip": "application/zip"}
IMMUTABLE = "public, max-age=31536000, immutable"


def accepts_gzip(value):
    """An explicit gzip refusal overrides a wildcard."""
    encodings = {}
    for item in value.lower().split(","):
        fields = item.strip().split(";")
        if not fields[0]:
            continue
        quality = 1.0
        for parameter in fields[1:]:
            name, _, raw = parameter.strip().partition("=")
            if name == "q":
                try:
                    quality = float(raw)
                except ValueError:
                    quality = 0.0
        encodings[fields[0]] = quality
    return encodings.get("gzip", encodings.get("*", 0)) > 0


def byte_range(value, size):
    """One byte range; ignore unknown units/multipart, reject bad byte syntax."""
    if not value.startswith("bytes=") or "," in value:
        return None
    match = re.fullmatch(r"bytes=(\d*)-(\d*)", value)
    if not match or not any(match.groups()) or not size:
        raise ValueError("unsatisfiable byte range")
    start, end = match.groups()
    if not start:
        count = int(end)
        if not count:
            raise ValueError("empty suffix")
        return max(0, size - count), size - 1
    start = int(start)
    end = min(int(end), size - 1) if end else size - 1
    if start >= size or end < start:
        raise ValueError("unsatisfiable byte range")
    return start, end


class OfflineHandler(SimpleHTTPRequestHandler):
    """Serve contained regular files only, with headers also on error paths."""

    def send_error(self, code, message=None, explain=None):
        # parse_request can reject a malformed version before assigning it.
        # The stdlib then retains HTTP/0.9, which suppresses all headers.
        # This server requires an HTTP response with isolation even on errors.
        if self.request_version == "HTTP/0.9":
            self.request_version = "HTTP/1.0"
        super().send_error(code, message, explain)

    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Resource-Policy", "cross-origin")
        if self.is_asset():
            self.send_header("Access-Control-Allow-Origin", "*")
        if not getattr(self, "_cache_sent", False):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def is_asset(self):
        # Also applies to encoded paths and errors below the asset directory.
        return unquote(urlsplit(getattr(self, "path", "")).path).startswith("/_ctm-assets/")

    def do_GET(self):
        self.serve_file(head=False)

    def do_HEAD(self):
        self.serve_file(head=True)

    def serve_file(self, *, head):
        self._cache_sent = False
        if self.request_version == "HTTP/0.9":
            self.send_error(HTTPStatus.HTTP_VERSION_NOT_SUPPORTED)
            return
        root = Path(self.directory).resolve()
        request_path = unquote(urlsplit(self.path).path)
        # Reject traversal instead of normalizing it into a different resource.
        if "\x00" in request_path or "\\" in request_path or ".." in request_path.split("/"):
            self.send_error(HTTPStatus.FORBIDDEN)
            return
        candidate = (root / request_path.lstrip("/")).resolve()
        if not candidate.is_relative_to(root):
            self.send_error(HTTPStatus.FORBIDDEN)
            return
        if candidate.is_dir():
            candidate = (candidate / "index.html").resolve()
        if not candidate.is_relative_to(root) or not candidate.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        content_type = MIME.get(candidate.suffix.lower()) or self.guess_type(str(candidate))
        vary = candidate.suffix.lower() in COMPRESSIBLE
        compressed = False
        if vary and accepts_gzip(self.headers.get("Accept-Encoding", "")):
            gz = Path(str(candidate) + ".gz").resolve()
            if gz.is_relative_to(root) and gz.is_file():
                candidate, compressed = gz, True
        try:
            source = candidate.open("rb")
        except OSError:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        with source:
            # Hash the actual selected representation: never reuse a stale tag
            # when a same-length file is replaced or when gzip is negotiated.
            digest = hashlib.sha256()
            while chunk := source.read(1024 * 1024):
                digest.update(chunk)
            size = source.tell()
            etag = '"' + digest.hexdigest() + '"'
            source.seek(0)
            condition = self.headers.get("If-None-Match")
            not_modified = condition is not None and (
                condition.strip() == "*" or
                any(tag.strip().removeprefix("W/") == etag for tag in condition.split(",")))
            status = HTTPStatus.NOT_MODIFIED if not_modified else HTTPStatus.OK
            selected = None
            if not head and not not_modified and "Range" in self.headers:
                # If-Range dates cannot prove this content hash unchanged.
                if self.headers.get("If-Range", etag).strip() == etag:
                    try:
                        selected = byte_range(self.headers["Range"], size)
                    except ValueError:
                        self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                        self.send_header("Content-Range", f"bytes */{size}")
                        self.send_header("Content-Length", "0")
                        self.send_header("ETag", etag)
                        self.end_headers()
                        return
                    if selected is not None:
                        status = HTTPStatus.PARTIAL_CONTENT
            self.send_response(status)
            self.send_header("ETag", etag)
            self.send_header("Accept-Ranges", "bytes")
            if vary:
                self.send_header("Vary", "Accept-Encoding")
            if compressed:
                self.send_header("Content-Encoding", "gzip")
            self.send_header("Cache-Control", IMMUTABLE if self.is_asset() else "no-cache")
            self._cache_sent = True
            if not_modified:
                self.end_headers()
                return
            self.send_header("Content-Type", content_type)
            if selected:
                start, end = selected
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
                count = end - start + 1
                source.seek(start)
            else:
                count = size
            self.send_header("Content-Length", str(count))
            self.end_headers()
            if not head:
                while count:
                    data = source.read(min(count, 1024 * 1024))
                    if not data:
                        break
                    self.wfile.write(data)
                    count -= len(data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", nargs="?", default="_site-exam")
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--cert", help="PEM certificate (trusted by exam machines)")
    parser.add_argument("--key", help="PEM private key")
    args = parser.parse_args()
    if bool(args.cert) != bool(args.key):
        parser.error("--cert and --key must be supplied together")
    directory = Path(args.directory).resolve()
    if not directory.is_dir():
        parser.error(f"not a directory: {directory}")
    with ThreadingHTTPServer((args.bind, args.port), partial(OfflineHandler, directory=str(directory))) as server:
        scheme = "http"
        if args.cert:
            context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            context.load_cert_chain(args.cert, args.key)
            server.socket = context.wrap_socket(server.socket, server_side=True)
            scheme = "https"
        print(f"Serving {directory} at {scheme}://{args.bind}:{server.server_port}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
