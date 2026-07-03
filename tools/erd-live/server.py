#!/usr/bin/env python3
"""MADPUMP ERD 라이브 뷰어.

docs/ERD.md 의 첫 ```mermaid 블록을 추출해 서빙.
브라우저가 1초마다 폴링해 내용이 바뀌면 자동으로 다시 렌더링한다.
고정 주소: http://127.0.0.1:8766/
실행: python3 tools/erd-live/server.py
"""
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

DOC = Path(__file__).resolve().parents[2] / "docs" / "ERD.md"
PORT = 8766

PAGE = """<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>MADPUMP ERD (live)</title>
<style>
  body { margin: 0; font-family: system-ui, sans-serif; background: #fff; }
  #bar { position: fixed; top: 0; left: 0; right: 0; padding: 6px 12px;
         background: #16213e; color: #e0e0e0; font-size: 13px; z-index: 10;
         display: flex; gap: 16px; align-items: center; }
  #status.ok::before { content: "● "; color: #4ade80; }
  #status.err::before { content: "● "; color: #f87171; }
  #view { padding: 48px 16px 16px; overflow: auto; }
  #err { color: #b91c1c; white-space: pre-wrap; padding: 0 16px; font-size: 12px; }
  svg { max-width: none !important; }
</style>
</head>
<body>
<div id="bar"><b>MADPUMP ERD</b><span id="status" class="ok">live</span>
<span style="opacity:.6">docs/ERD.md 저장 시 자동 갱신 (1s 폴링)</span></div>
<div id="err"></div>
<div id="view"></div>
<script type="module">
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
mermaid.initialize({ startOnLoad: false, theme: 'default', er: { useMaxWidth: false } });
let last = '';
let n = 0;
const status = document.getElementById('status');
const err = document.getElementById('err');
const view = document.getElementById('view');
async function tick() {
  try {
    const r = await fetch('/src?ts=' + Date.now());
    const t = await r.text();
    if (t !== last) {
      const { svg } = await mermaid.render('erd' + (n++), t);
      view.innerHTML = svg;
      last = t;
      err.textContent = '';
    }
    status.className = 'ok';
    status.textContent = 'live';
  } catch (e) {
    status.className = 'err';
    status.textContent = 'render error (마지막 정상본 유지)';
    err.textContent = String(e && e.message || e);
  }
  setTimeout(tick, 1000);
}
tick();
</script>
</body>
</html>
"""


def extract_mermaid() -> str:
    try:
        text = DOC.read_text(encoding="utf-8")
    except OSError as e:
        return f'erDiagram\n    %% 문서를 읽을 수 없음: {e}'
    m = re.search(r"```mermaid\n(.*?)```", text, re.DOTALL)
    return m.group(1) if m else "erDiagram\n    %% mermaid 블록 없음"


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/src"):
            body = extract_mermaid().encode("utf-8")
            ctype = "text/plain; charset=utf-8"
        else:
            body = PAGE.encode("utf-8")
            ctype = "text/html; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    print(f"serving http://127.0.0.1:{PORT}/  (source: {DOC})")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
