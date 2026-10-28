// DIAGNOSTIC ONLY: minimal macOS WKWebView host (like SEB's WKWebView mode)
// that loads argv[1]. Build: swiftc -O wkapp.swift -o wkapp (see the workflow,
// which embeds an Info.plist allowing plain-HTTP loads).
import AppKit
import WebKit

let url = URL(string: CommandLine.arguments[1])!
let app = NSApplication.shared
app.setActivationPolicy(.regular)
let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 900, height: 700), styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
let webView = WKWebView(frame: window.contentView!.bounds, configuration: WKWebViewConfiguration())
webView.autoresizingMask = [.width, .height]
window.contentView!.addSubview(webView)
window.makeKeyAndOrderFront(nil)
webView.load(URLRequest(url: url))
app.activate(ignoringOtherApps: true)
app.run()
