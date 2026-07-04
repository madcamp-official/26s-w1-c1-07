#!/usr/bin/env python3
"""SPA fallback 정적 서버 — 완성된 시안(dist/)을 안정적으로 서빙.

사용: python3 serve-spa.py <dist_dir> <port>
존재하지 않는 확장자 없는 경로는 index.html로 폴백 (react-router 대응).
"""
import functools
import os
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler


class SpaHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        p = super().translate_path(path)
        if not os.path.exists(p) and "." not in os.path.basename(p):
            return os.path.join(self.directory, "index.html")
        return p

    def log_message(self, *args):
        pass  # 조용히


if __name__ == "__main__":
    dist, port = sys.argv[1], int(sys.argv[2])
    handler = functools.partial(SpaHandler, directory=os.path.abspath(dist))
    print(f"serving {dist} on http://localhost:{port}/", flush=True)
    HTTPServer(("127.0.0.1", port), handler).serve_forever()
