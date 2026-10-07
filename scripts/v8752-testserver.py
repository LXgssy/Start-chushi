#!/usr/bin/env python3
"""v8.7.52 E2E 测试资源服务器：静态假资源（嗅探只看响应头，字节可假）。
/video.mp4 -> video/mp4（200KB）
/big.png   -> image/png（150KB，过 100KB 大图律）
/doc.pdf   -> application/pdf（80KB）
/small.png -> image/png（10KB，应被过滤）
/          -> test.html（<video>/<img> 引用上述资源）
"""
import http.server
import socketserver
import threading
import pathlib

PORT = 18923
ROOT = pathlib.Path("/tmp/sniffer-test")


def build_bytes(n, seed=0):
    return bytes((i * 31 + seed) % 256 for i in range(n))


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        table = {
            "/video.mp4": ("video/mp4", build_bytes(200 * 1024, 1)),
            "/big.png": ("image/png", build_bytes(150 * 1024, 2)),
            "/doc.pdf": ("application/pdf", build_bytes(80 * 1024, 3)),
            "/small.png": ("image/png", build_bytes(10 * 1024, 4)),
        }
        if self.path in table:
            ctype, body = table[self.path]
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        html = (
            "<!doctype html><html><body><h1>sniffer test page</h1>"
            '<video id="v" src="/video.mp4" muted></video>'
            '<img src="/big.png"><img src="/small.png">'
            '<a id="pdflink" href="/doc.pdf">pdf</a>'
            "<script>"
            "/* 确定性请求面：fetch 四类资源（xhr 类型，扩展名+MIME 双判定） */"
            "['/video.mp4','/big.png','/doc.pdf','/small.png'].forEach("
            "function(p){fetch(p).catch(function(){});});"
            "const v=document.getElementById('v');v.play().catch(function(){});"
            "</script>"
            "</body></html>"
        ).encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(html)))
        self.end_headers()
        self.wfile.write(html)


def serve():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
        httpd.serve_forever()


if __name__ == "__main__":
    ROOT.mkdir(exist_ok=True)
    print("serving", PORT, flush=True)
    serve()
