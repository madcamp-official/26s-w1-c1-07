#!/usr/bin/env python3
"""시안 서버 감시자 — serving.json의 각 (port, dist)가 항상 살아있도록 유지.

사용: python3 keep-serving.py   (design-lab/tools 에서, 백그라운드로)
- 10초마다 포트 점검, 죽어 있으면 serve-spa.py로 재기동
- serving.json을 매 사이클 다시 읽으므로 항목 추가 시 재시작 불필요
"""
import json
import os
import socket
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
LAB = os.path.dirname(HERE)
CONF = os.path.join(HERE, "serving.json")
SERVE = os.path.join(HERE, "serve-spa.py")


def port_alive(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1.0)
        return s.connect_ex(("127.0.0.1", port)) == 0


def main():
    print(f"[keep-serving] watching {CONF}", flush=True)
    while True:
        try:
            entries = json.load(open(CONF))
        except Exception as e:
            print(f"[keep-serving] conf error: {e}", flush=True)
            time.sleep(10)
            continue
        for e in entries:
            port, dist = e["port"], os.path.join(LAB, e["dist"])
            if not os.path.isdir(dist):
                continue
            if not port_alive(port):
                subprocess.Popen(
                    [sys.executable, SERVE, dist, str(port)],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    start_new_session=True,
                )
                print(f"[keep-serving] (re)started {e.get('name', port)} :{port}", flush=True)
        time.sleep(10)


if __name__ == "__main__":
    main()
