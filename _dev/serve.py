#!/usr/bin/env python3
"""Local preview that never lets the browser reuse an old file. Run from the repo root."""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1]) if sys.argv[1:] else 8933), NoCache).serve_forever()
