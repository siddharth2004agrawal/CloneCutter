#!/usr/bin/env python3
"""
CloneCutter local server: serves the web UI + API for scanning and moving files
to the system Recycle Bin. Works in Brave, Firefox, Safari, etc. (no File System Access API).

Usage (from this folder):
  pip install -r requirements.txt
  python server.py

Then open http://127.0.0.1:8765 (or the port printed).
If you use another static server (e.g. port 5500), set in index.html before script.js:
  <script>window.__CLONECUTTER_API__ = 'http://127.0.0.1:8765';</script>
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
from collections import defaultdict
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

try:
    from send2trash import send2trash

    HAS_SEND2TRASH = True
except ImportError:
    HAS_SEND2TRASH = False

ROOT = Path(__file__).resolve().parent

EXTENSIONS = {
    "image": {"jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "tif", "heic", "heif", "avif"},
    "video": {"mp4", "mkv", "mov", "avi", "webm", "wmv", "flv", "m4v", "3gp"},
    "audio": {"mp3", "wav", "flac", "aac", "ogg", "m4a", "wma"},
    "document": {"pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf", "csv", "md"},
    "archive": {"zip", "rar", "7z", "tar", "gz", "bz2", "xz"},
}

# Paths discovered in the last /api/scan (allowed for preview + delete)
LAST_SCAN_PATHS: set[str] = set()


def _ext(path: str) -> str:
    base = Path(path).name
    if "." not in base:
        return ""
    return base.rsplit(".", 1)[-1].lower()


def file_type_allowed(path: str, file_types: list) -> bool:
    if not file_types or "all" in file_types:
        return True
    ext = _ext(path)
    for t in file_types:
        if t in EXTENSIONS and ext in EXTENSIONS[t]:
            return True
    return False


def walk_files(roots: list[str]) -> list[str]:
    out: list[str] = []
    for raw in roots:
        try:
            root = Path(os.path.normpath(raw))
        except (TypeError, ValueError):
            continue
        if not root.is_dir():
            continue
        root = root.resolve()
        for dirpath, _, filenames in os.walk(root):
            for name in filenames:
                p = Path(dirpath) / name
                try:
                    out.append(str(p.resolve()))
                except OSError:
                    pass
    return out


def quick_hash_path(path: str) -> str:
    size = os.path.getsize(path)
    with open(path, "rb") as f:
        chunk = f.read(256 * 1024)
    h = hashlib.sha256(chunk).hexdigest()
    return f"{size}:{h}"


def full_hash_path(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def scan_duplicates(roots: list[str], file_types: list) -> tuple[list, int]:
    global LAST_SCAN_PATHS
    LAST_SCAN_PATHS = set()

    entries: list[tuple[str, int, int]] = []
    for ap in walk_files(roots):
        if not file_type_allowed(ap, file_types):
            continue
        try:
            st = os.stat(ap)
        except OSError:
            continue
        entries.append((ap, st.st_size, int(st.st_mtime * 1000)))
        LAST_SCAN_PATHS.add(ap)

    buckets: dict[str, list[tuple[str, int, int]]] = defaultdict(list)
    for ap, size, mtime in entries:
        try:
            qh = quick_hash_path(ap)
        except OSError:
            continue
        buckets[qh].append((ap, size, mtime))

    full_map: dict[str, list[dict]] = defaultdict(list)
    for qh, group in buckets.items():
        if len(group) <= 1:
            continue
        for ap, size, mtime in group:
            try:
                fh = full_hash_path(ap)
            except OSError:
                continue
            full_map[fh].append({"path": ap, "size": size, "lastModified": mtime})

    duplicates = []
    for i, (fh, files) in enumerate(full_map.items(), start=1):
        if len(files) > 1:
            duplicates.append({"id": str(i), "hash": fh, "files": files})

    return duplicates, len(entries)


def cors_headers(handler) -> None:
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")


def send_json(handler, code: int, obj: dict) -> None:
    data = json.dumps(obj).encode("utf-8")
    handler.send_response(code)
    cors_headers(handler)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(data)))
    handler.end_headers()
    handler.wfile.write(data)


def read_body(handler) -> bytes:
    n = int(handler.headers.get("Content-Length", "0") or "0")
    if n <= 0:
        return b""
    return handler.rfile.read(n)


class Handler:
    """Compose with SimpleHTTPRequestHandler via factory."""

    @staticmethod
    def create():
        from http.server import SimpleHTTPRequestHandler

        class H(SimpleHTTPRequestHandler):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, directory=str(ROOT), **kwargs)

            def log_message(self, fmt, *args_):
                sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args_))

            def do_OPTIONS(self):
                self.send_response(204)
                cors_headers(self)
                self.end_headers()

            def do_GET(self):
                parsed = urlparse(self.path)
                p = parsed.path.rstrip("/") or "/"

                if p == "/api/clonecutter-health":
                    send_json(self, 200, {"ok": True})
                    return
                if p == "/api/preview":
                    qs = parse_qs(parsed.query)
                    raw = (qs.get("path") or [None])[0]
                    if not raw:
                        self.send_error(400)
                        return
                    path = unquote(raw)
                    try:
                        path = str(Path(path).resolve())
                    except OSError:
                        self.send_error(400)
                        return
                    if path not in LAST_SCAN_PATHS:
                        self.send_error(403)
                        return
                    if not os.path.isfile(path):
                        self.send_error(404)
                        return
                    ext = _ext(path)
                    mime = "application/octet-stream"
                    if ext in ("jpg", "jpeg"):
                        mime = "image/jpeg"
                    elif ext == "png":
                        mime = "image/png"
                    elif ext == "gif":
                        mime = "image/gif"
                    elif ext == "webp":
                        mime = "image/webp"
                    elif ext in ("mp4",):
                        mime = "video/mp4"
                    elif ext in ("webm",):
                        mime = "video/webm"
                    try:
                        with open(path, "rb") as f:
                            body = f.read()
                    except OSError:
                        self.send_error(500)
                        return
                    self.send_response(200)
                    cors_headers(self)
                    self.send_header("Content-Type", mime)
                    self.send_header("Content-Length", str(len(body)))
                    self.send_header("Cache-Control", "no-store")
                    self.end_headers()
                    self.wfile.write(body)
                    return

                return SimpleHTTPRequestHandler.do_GET(self)

            def do_POST(self):
                parsed = urlparse(self.path)
                if parsed.path != "/api/scan" and parsed.path != "/api/move":
                    self.send_error(404)
                    return

                body = read_body(self)
                try:
                    data = json.loads(body.decode("utf-8") or "{}")
                except json.JSONDecodeError:
                    send_json(self, 400, {"error": "Invalid JSON"})
                    return

                if parsed.path == "/api/scan":
                    roots = data.get("roots") or []
                    file_types = data.get("file_types") or ["all"]
                    if not isinstance(roots, list) or not roots:
                        send_json(self, 400, {"error": "Provide roots: [ absolute folder paths ]"})
                        return
                    try:
                        duplicates, total = scan_duplicates([str(r) for r in roots], file_types)
                    except Exception as e:
                        send_json(self, 500, {"error": str(e)})
                        return
                    send_json(
                        self,
                        200,
                        {"duplicates": duplicates, "totalFiles": total},
                    )
                    return

                if parsed.path == "/api/move":
                    paths = data.get("paths") or []
                    if not isinstance(paths, list) or not paths:
                        send_json(self, 400, {"error": "No paths"})
                        return
                    moved = []
                    errors = []
                    for raw in paths:
                        try:
                            path = str(Path(raw).resolve())
                        except OSError:
                            errors.append({"path": raw, "error": "bad path"})
                            continue
                        if path not in LAST_SCAN_PATHS:
                            errors.append({"path": raw, "error": "not in last scan"})
                            continue
                        if not os.path.isfile(path):
                            errors.append({"path": path, "error": "missing"})
                            continue
                        try:
                            if HAS_SEND2TRASH:
                                send2trash(path)
                            else:
                                raise RuntimeError("send2trash not installed; pip install send2trash")
                            moved.append(path)
                            LAST_SCAN_PATHS.discard(path)
                        except Exception as e:
                            errors.append({"path": path, "error": str(e)})
                    send_json(self, 200, {"moved": moved, "errors": errors})
                    return

        return H


def main():
    port = int(os.environ.get("PORT", "8765"))
    host = os.environ.get("HOST", "127.0.0.1")
    h = Handler.create()
    httpd = ThreadingHTTPServer((host, port), h)
    print(f"CloneCutter server: http://{host}:{port}/")
    print("Open that URL in your browser (Brave, Chrome, etc.).")
    if not HAS_SEND2TRASH:
        print("WARNING: pip install send2trash — required to delete to Recycle Bin.", file=sys.stderr)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
