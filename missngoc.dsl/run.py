"""Mở trang soạn đề ExamDSL:  python run.py  [--port 8010] [--no-browser]"""
import argparse
import os
import sys
import threading
import webbrowser

import uvicorn


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    os.chdir(os.path.dirname(os.path.abspath(__file__)))   # npm run dev chạy từ thư mục gốc repo
    sys.path.insert(0, os.getcwd())
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8010)
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()
    url = f"http://{args.host}:{args.port}"
    if not args.no_browser:
        threading.Timer(1.2, lambda: webbrowser.open(url)).start()
    print(f"ExamDSL chạy ở {url}  (Ctrl+C để dừng)")
    uvicorn.run("server.app:app", host=args.host, port=args.port)


if __name__ == "__main__":
    main()
