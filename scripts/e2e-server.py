"""Static file server for the e2e suite: `python3 -m http.server`, with a deeper accept backlog.

The stock server listens with a backlog of 5. A WebKit page opens dozens of connections at once
and the suite runs many pages in parallel, so connections overflowed the backlog, were dropped
and retried by the OS after 1 s, 3 s, 7 s ... which stalled page loads past the test timeout.

Usage: python3 scripts/e2e-server.py PORT   (serves the current directory on 127.0.0.1)
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class DeepBacklogServer(ThreadingHTTPServer):
    request_queue_size = 1024


if __name__ == "__main__":
    DeepBacklogServer(("127.0.0.1", int(sys.argv[1])), SimpleHTTPRequestHandler).serve_forever()
