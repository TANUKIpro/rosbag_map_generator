#!/usr/bin/env python3
"""
Simple HTTP server for ROS Bag Map Generator

Usage:
    python3 start-server.py

Then open: http://localhost:8000
"""

import http.server
import socketserver
import os
import sys

PORT = 8000

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Add CORS headers for local development
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

def main():
    # Change to the script's directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)

    Handler = MyHTTPRequestHandler

    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print("=" * 60)
        print(f"🚀 ROS Bag Map Generator サーバーを起動しました")
        print(f"📁 ディレクトリ: {script_dir}")
        print(f"🌐 URL: http://localhost:{PORT}")
        print("=" * 60)
        print("\nブラウザで上記URLを開いてください。")
        print("停止するには Ctrl+C を押してください。\n")

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n\n👋 サーバーを停止しました。")
            sys.exit(0)

if __name__ == "__main__":
    main()
