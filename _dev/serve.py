#!/usr/bin/env python3
"""Local preview that never lets the browser reuse an old file. Run from the repo root."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


ThreadingHTTPServer(('127.0.0.1', 8933), NoCache).serve_forever()
