# Safe Exam Browser settings for the offline website

For exam IT preparing the [offline Python website ZIP](exam-site-zip.md) in Safe Exam Browser (SEB) on Windows,
macOS or iOS. CTM Assessment ships no `.seb` file: the exam office makes its own configuration with these settings
and runs the manual check below before the first exam (decision D7 of the
[1.0 plan](consolidation/2026-11-release-1.0-plan.md)).

## Server

- Extract the ZIP into its own directory on the exam web server and serve it at one fixed host name for the whole
  exam. Browser answers belong to that origin, so do not mix a host name and an IP address or redeploy during the
  exam.
- **Preferred:** HTTPS with a certificate every exam machine trusts, and the headers in
  [Serving an offline exam site](exam-server.md#http-contract) on every response, including errors. The bundled
  `serve.py` sends them:

  ```sh
  python3 serve.py /srv/exam/python --bind 0.0.0.0 --port 8443 --cert exam.crt --key exam.key
  ```

  This gives a secure, cross-origin-isolated page: Run, cooperative Stop and `input()` work.
- **Degraded:** plain HTTP on the LAN. Run works and Stop restarts Python (variables are reset). `input()` is not
  available; the page says so.
- Nothing on the page needs the internet. Only the exam server should appear in the network log.

## SEB configuration

| Setting | Value |
|---|---|
| Start URL | The site's `index.html` on the exam server (for example `https://exam.example.org/python/`) |
| URL filter | Allow only the exam server's origin (scheme, host and port of the start URL). The site loads nothing from elsewhere |
| Embedded content | The site opens as its own top-level window, not inside a frame of another exam system. A frame inside another page loses cross-origin isolation |
| JavaScript, WebAssembly, Web Workers | Enabled (Python runs in a worker) |
| Service workers | Not needed; the exam path works with them blocked |
| `blob:` and `data:` URLs | Allowed for the exam server's pages (exports and plots use them) |
| Browser cache | Keep it for the session; do not clear browsing data at start-up after the first load of the day |
| Clipboard | SEB's internal or private clipboard, so text copied from the site can be pasted into the exam answer window |
| Downloads and uploads | Off, unless the exam office decides that answers are handed in as files |
| Reload | Allowed (answers are saved in the browser and restored) |
| Quit | The exam office's usual quit link or password |

Windows SEB uses Chromium (CEF). CI tests the Chromium releases matching CEF branches 139 and 147, and WebKit on
macOS 15 as a stand-in for SEB on macOS and iOS. Those tests are engine checks, not SEB certification.

## Manual check (AC, before the first exam)

Run on **Windows, macOS and iOS** with the final `.seb` settings, the internet unavailable, once against a plain
LAN server and once against the HTTPS server with headers. Record the results in the table at the end.

1. Open the start URL. Open **Python**, **Second window** and **Exercises** from the navigation bar. Type in an
   editor; reload; the text is restored and nothing runs by itself.
2. Run `print(6 * 7)` twice.
3. Run `while True: pass`, select **Stop**, then run `print("after stop")`. The page stays responsive. On plain
   HTTP, a notice says the variables were reset.
4. Run `name = input("Name: "); print(name)`. On HTTPS, enter a value with non-ASCII letters, then stop a second
   waiting prompt. On plain HTTP, the page explains that input is not available.
5. On **Second window**, run `import numpy as np; print(np.array([20, 22]).sum())`.
6. On **Exercises**, answer `1` in the first exercise and `3.14` in the second, and select **Check** on each: both
   are correct. Select **Check** on the Python exercise without changes: it reports failing tests.
7. Copy code and output, open **Export my answers**, select **Copy all** and paste into the real exam answer field
   in the configured SEB window.
8. Quit SEB with the configured quit method.

| Platform | OS and device | SEB version | Server mode | ZIP SHA-256 | Steps passed | Notes |
|---|---|---|---|---|---|---|
| Windows | | | plain HTTP | | | |
| Windows | | | HTTPS + headers | | | |
| macOS | | | plain HTTP | | | |
| macOS | | | HTTPS + headers | | | |
| iOS | | | plain HTTP | | | |
| iOS | | | HTTPS + headers | | | |
