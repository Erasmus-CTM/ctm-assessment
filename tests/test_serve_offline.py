"""Exercise the actual HTTP server, not a second model of its headers."""
from functools import partial
import gzip
import hashlib
import http.client
from http.server import ThreadingHTTPServer
import importlib.util
from pathlib import Path
import tempfile
import socket
import threading
import unittest

SPEC = importlib.util.spec_from_file_location(
    "serve_offline", Path(__file__).resolve().parents[1] / "scripts" / "serve-offline.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class QuietHandler(MODULE.OfflineHandler):
    def log_message(self, *args):
        pass


class OfflineHTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.root = Path(cls.temp.name)
        assets = cls.root / "_ctm-assets" / "pyodide" / "1.0"
        assets.mkdir(parents=True)
        (cls.root / "site_libs").mkdir()
        (cls.root / "index.html").write_text("<h1>Exam</h1>", encoding="utf-8")
        (cls.root / "site_libs" / "quarto.js").write_text("quarto()", encoding="utf-8")
        cls.wheel = bytes(range(256)) * 4097  # more than two 512 KiB requests
        (assets / "package.whl").write_bytes(cls.wheel)
        (assets / "stdlib.zip").write_bytes(cls.wheel)
        cls.wasm = b"wasm" * 300
        (assets / "core.wasm").write_bytes(cls.wasm)
        cls.compressed = gzip.compress(cls.wasm, mtime=0)
        (assets / "core.wasm.gz").write_bytes(cls.compressed)
        (assets / "module.mjs").write_text("export const x=1;", encoding="utf-8")
        (assets / "empty.whl").write_bytes(b"")
        cls.server = ThreadingHTTPServer(
            ("127.0.0.1", 0), partial(QuietHandler, directory=str(cls.root)))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=3)
        cls.temp.cleanup()

    def request(self, path, headers=None, method="GET"):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=5)
        try:
            connection.request(method, path, headers=headers or {})
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def check_headers(self, headers, *, assets=False):
        self.assertEqual(headers["Cross-Origin-Opener-Policy"], "same-origin")
        self.assertEqual(headers["Cross-Origin-Embedder-Policy"], "require-corp")
        self.assertEqual(headers["Cross-Origin-Resource-Policy"], "cross-origin")
        if assets:
            self.assertEqual(headers["Access-Control-Allow-Origin"], "*")
        else:
            self.assertNotIn("Access-Control-Allow-Origin", headers)

    def test_html_quarto_and_asset_cache_boundaries(self):
        for path in ["/", "/site_libs/quarto.js"]:
            with self.subTest(path=path):
                status, headers, body = self.request(path)
                self.assertEqual(status, 200)
                self.check_headers(headers)
                self.assertEqual(headers["Cache-Control"], "no-cache")
                self.assertTrue(body)
        status, headers, body = self.request("/_ctm-assets/pyodide/1.0/module.mjs")
        self.assertEqual(status, 200)
        self.assertEqual(headers["Content-Type"], "text/javascript")
        self.assertEqual(headers["Cache-Control"], MODULE.IMMUTABLE)
        self.check_headers(headers, assets=True)

    def test_errors_keep_isolation_but_never_immutable(self):
        for path in ["/absent", "/_ctm-assets/missing.whl"]:
            with self.subTest(path=path):
                status, headers, _ = self.request(path)
                self.assertEqual(status, 404)
                self.check_headers(headers, assets=path.startswith("/_ctm-assets/"))
                self.assertEqual(headers["Cache-Control"], "no-cache")
        status, headers, _ = self.request("/_ctm-assets/../index.html")
        self.assertEqual(status, 403)
        self.check_headers(headers, assets=True)
        self.assertEqual(headers["Cache-Control"], "no-cache")
        status, headers, _ = self.request("/", method="POST")
        self.assertEqual(status, 501)
        self.check_headers(headers)
        self.assertEqual(headers["Cache-Control"], "no-cache")

    def test_prefetch_512k_ranges_are_identity_bytes(self):
        for extension in ["whl", "zip"]:
            path = "/_ctm-assets/pyodide/1.0/" + ("package.whl" if extension == "whl" else "stdlib.zip")
            for start in [0, 524288, 1048576]:
                with self.subTest(extension=extension, start=start):
                    end = min(start + 524287, len(self.wheel) - 1)
                    status, headers, body = self.request(path, {
                        "Range": f"bytes={start}-{end}", "Accept-Encoding": "gzip"})
                    self.assertEqual(status, 206)
                    self.assertEqual(body, self.wheel[start:end + 1])
                    self.assertEqual(headers["Content-Range"], f"bytes {start}-{end}/{len(self.wheel)}")
                    self.assertEqual(int(headers["Content-Length"]), len(body))
                    self.assertNotIn("Content-Encoding", headers)
                    self.check_headers(headers, assets=True)

    def test_open_suffix_and_clamped_ranges(self):
        for value, expected in [("bytes=1048576-", self.wheel[1048576:]),
                                ("bytes=-17", self.wheel[-17:]),
                                ("bytes=5-999999999", self.wheel[5:])]:
            with self.subTest(value=value):
                status, headers, body = self.request("/_ctm-assets/pyodide/1.0/package.whl", {"Range": value})
                self.assertEqual(status, 206)
                self.assertEqual(body, expected)
                self.assertEqual(int(headers["Content-Length"]), len(expected))

    def test_unsatisfiable_ranges_include_error_headers(self):
        for value in ["bytes=999999999-", "bytes=9-1", "bytes=-0", "bytes=bad"]:
            status, headers, body = self.request("/_ctm-assets/pyodide/1.0/package.whl", {"Range": value})
            self.assertEqual(status, 416)
            self.assertEqual(headers["Content-Range"], f"bytes */{len(self.wheel)}")
            self.assertEqual(body, b"")
            self.assertEqual(headers["Cache-Control"], "no-cache")
            self.check_headers(headers, assets=True)
        status, headers, _ = self.request("/_ctm-assets/pyodide/1.0/empty.whl", {"Range": "bytes=0-"})
        self.assertEqual(status, 416)
        self.assertEqual(headers["Content-Range"], "bytes */0")

    def test_unknown_and_multiple_ranges_are_ignored(self):
        for value in ["items=0-1", "bytes=0-1,3-4"]:
            status, _, body = self.request("/_ctm-assets/pyodide/1.0/package.whl", {"Range": value})
            self.assertEqual(status, 200)
            self.assertEqual(body, self.wheel)

    def test_strong_etag_revalidation_precedes_range(self):
        path = "/_ctm-assets/pyodide/1.0/package.whl"
        _, headers, _ = self.request(path)
        tag = '"' + hashlib.sha256(self.wheel).hexdigest() + '"'
        self.assertEqual(headers["ETag"], tag)
        for condition in [tag, "W/" + tag, '"other", ' + tag, "*"]:
            status, headers, body = self.request(path, {"If-None-Match": condition, "Range": "bytes=0-1"})
            self.assertEqual(status, 304)
            self.assertEqual(body, b"")
            self.assertEqual(headers["ETag"], tag)
            self.check_headers(headers, assets=True)
        status, _, body = self.request(path, {"If-None-Match": '"other"'})
        self.assertEqual((status, body), (200, self.wheel))

    def test_if_range_requires_exact_strong_etag(self):
        path = "/_ctm-assets/pyodide/1.0/package.whl"
        _, headers, _ = self.request(path)
        tag = headers["ETag"]
        for condition, expected in [(tag, 206), ("W/" + tag, 200), ('"stale"', 200)]:
            status, _, body = self.request(path, {"Range": "bytes=0-1", "If-Range": condition})
            self.assertEqual(status, expected)
            self.assertEqual(body, self.wheel[:2] if expected == 206 else self.wheel)

    def test_precompressed_mime_vary_and_representation_specific_etag(self):
        path = "/_ctm-assets/pyodide/1.0/core.wasm"
        _, identity, body = self.request(path)
        self.assertEqual(body, self.wasm)
        for accept, compressed in [("gzip", True), ("gzip;q=0", False),
                                   ("br, *;q=0.5", True), ("*;q=1,gzip;q=0", False)]:
            status, headers, body = self.request(path, {"Accept-Encoding": accept})
            self.assertEqual(status, 200)
            self.assertEqual(body, self.compressed if compressed else self.wasm)
            self.assertEqual(headers["Content-Type"], "application/wasm")
            self.assertEqual(headers["Vary"], "Accept-Encoding")
            if compressed:
                self.assertEqual(headers["Content-Encoding"], "gzip")
                self.assertNotEqual(headers["ETag"], identity["ETag"])
            else:
                self.assertNotIn("Content-Encoding", headers)
        status, _, _ = self.request(path, {"Accept-Encoding": "gzip", "If-None-Match": identity["ETag"]})
        self.assertEqual(status, 200)

    def test_head_and_empty_files(self):
        status, headers, body = self.request("/_ctm-assets/pyodide/1.0/package.whl",
                                             {"Range": "bytes=0-1"}, method="HEAD")
        self.assertEqual(status, 200)  # Range applies only to GET.
        self.assertEqual(int(headers["Content-Length"]), len(self.wheel))
        self.assertEqual(body, b"")
        status, headers, body = self.request("/_ctm-assets/pyodide/1.0/empty.whl")
        self.assertEqual((status, body), (200, b""))
        self.assertEqual(headers["Content-Length"], "0")

    def test_same_length_replacement_invalidates_etag(self):
        target = self.root / "replace.txt"
        target.write_bytes(b"first")
        _, before, _ = self.request("/replace.txt")
        target.write_bytes(b"other")
        status, after, body = self.request("/replace.txt", {"If-None-Match": before["ETag"]})
        self.assertEqual((status, body), (200, b"other"))
        self.assertNotEqual(before["ETag"], after["ETag"])

    def test_protocol_error_has_headers_before_a_path_is_parsed(self):
        with socket.create_connection(("127.0.0.1", self.server.server_port), timeout=5) as connection:
            connection.sendall(b"GET / HTTP/2.0\r\n\r\n")
            parts = []
            while part := connection.recv(8192):
                parts.append(part)
        raw = b"".join(parts)
        self.assertIn(b"505", raw)
        self.assertIn(b"Cross-Origin-Embedder-Policy: require-corp", raw)
        self.assertIn(b"Cache-Control: no-cache", raw)

    def test_malformed_target_returns_header_bearing_bad_request(self):
        status, headers, _ = self.request("http://[")
        self.assertEqual(status, 400)
        self.check_headers(headers)
        self.assertEqual(headers["Cache-Control"], "no-cache")

    def test_directory_redirect_preserves_relative_assets_and_query(self):
        directory = self.root / "subdir"
        directory.mkdir(exist_ok=True)
        (directory / "index.html").write_text("subdirectory")
        for method in ["GET", "HEAD"]:
            status, headers, body = self.request("/subdir?view=exam", method=method)
            self.assertEqual(status, 301)
            self.assertEqual(headers["Location"], "/subdir/?view=exam")
            self.assertEqual(body, b"")
            self.check_headers(headers)
            self.assertEqual(headers["Cache-Control"], "no-cache")
        status, _, body = self.request("/subdir/")
        self.assertEqual((status, body), (200, b"subdirectory"))

    def test_symlink_loop_is_a_header_bearing_error(self):
        loop = self.root / "_ctm-assets" / "loop"
        try:
            loop.symlink_to(loop)
        except (OSError, NotImplementedError):
            self.skipTest("symlinks unavailable on this platform")
        status, headers, _ = self.request("/_ctm-assets/loop")
        self.assertEqual(status, 403)
        self.check_headers(headers, assets=True)
        self.assertEqual(headers["Cache-Control"], "no-cache")

    def test_encoded_traversal_and_symlink_escape(self):
        status, _, _ = self.request("/%2e%2e/secret")
        self.assertEqual(status, 403)
        status, _, _ = self.request("/%00")
        self.assertEqual(status, 403)
        with tempfile.TemporaryDirectory() as outside:
            secret = Path(outside) / "secret.txt"
            secret.write_text("outside")
            link = self.root / "escape.txt"
            try:
                link.symlink_to(secret)
            except (OSError, NotImplementedError):
                self.skipTest("symlinks unavailable on this platform")
            status, headers, body = self.request("/escape.txt")
            self.assertEqual(status, 403)
            self.assertNotIn(b"outside", body)
            self.check_headers(headers)


if __name__ == "__main__":
    unittest.main()
