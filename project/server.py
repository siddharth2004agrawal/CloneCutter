#!/usr/bin/env python3
"""Serve CloneCutter and scan the host filesystem. Run: python server.py."""
from __future__ import annotations

import hashlib
import json
import mimetypes
import os
import stat
import sys
import threading
import time
import uuid
from collections import defaultdict
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

try:
    from send2trash import send2trash
    HAS_SEND2TRASH = True
except ImportError:
    HAS_SEND2TRASH = False
    send2trash = None

ROOT = Path(__file__).resolve().parent
UI_ROOT = ROOT / "dist"
EXTENSIONS = {
    "image": {"jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "tif", "heic", "heif", "avif"},
    "video": {"mp4", "mkv", "mov", "avi", "webm", "wmv", "flv", "m4v", "3gp"},
    "audio": {"mp3", "wav", "flac", "aac", "ogg", "m4a", "wma"},
    "document": {"pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf", "csv", "md"},
    "archive": {"zip", "rar", "7z", "tar", "gz", "bz2", "xz"},
}
VIRTUAL_PATHS = {"/proc", "/sys", "/dev", "/run"}
TRASH_PATHS = {str(Path(os.environ.get("XDG_DATA_HOME", str(Path.home() / ".local" / "share"))) / "Trash")}
LAST_SCAN_PATHS: set[str] = set()
LAST_SCAN_GROUPS: list[dict] = []
LAST_SCAN_ID = None
OPERATION_LOCK = threading.Lock()
STATE_LOCK = threading.Lock()
SCAN_STATE: dict = {}
SCAN_CANCEL = threading.Event()


class ScanCancelled(Exception):
    pass


def filesystem_roots() -> list[str]:
    if os.name == "nt":
        import ctypes
        mask = ctypes.windll.kernel32.GetLogicalDrives()
        return [f"{chr(65 + i)}:\\" for i in range(26) if mask & (1 << i)]
    return ["/"]


def file_type_allowed(path: str, file_types: list) -> bool:
    ext = Path(path).suffix.lower().lstrip(".")
    return not file_types or "all" in file_types or any(ext in EXTENSIONS.get(t, ()) for t in file_types)


def excluded_directory(path: str) -> bool:
    name = Path(path).name.lower()
    return path in VIRTUAL_PATHS or path in TRASH_PATHS or name in {".trash", ".trashes", "$recycle.bin"} or name.startswith(".trash-")


def check_cancel(cancel):
    if cancel and cancel.is_set():
        raise ScanCancelled()


def walk_files(roots, summary=None, cancel=None):
    """Yield real regular files, without following links or opening devices."""
    summary = summary if summary is not None else {"skipped": 0}
    def inaccessible(_error):
        summary["skipped"] += 1
    for raw in dict.fromkeys(roots):
        root = os.path.abspath(raw)
        if os.path.islink(root) or excluded_directory(root):
            continue
        for directory, dirs, names in os.walk(root, followlinks=False, onerror=inaccessible):
            check_cancel(cancel)
            dirs[:] = [name for name in dirs if not excluded_directory(os.path.join(directory, name))
                       and not os.path.islink(os.path.join(directory, name))]
            for name in names:
                check_cancel(cancel)
                path = os.path.join(directory, name)
                try:
                    info = os.lstat(path)
                    if stat.S_ISREG(info.st_mode):
                        yield path, info
                except OSError:
                    summary["skipped"] += 1


def signature(info):
    return (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def hash_path(path, expected, *, quick=False, cancel=None):
    """Reject changed files and symlinks, including replacements during hashing."""
    if signature(os.lstat(path)) != expected or not stat.S_ISREG(os.lstat(path).st_mode):
        raise OSError("File changed since the scan; scan again.")
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0) | getattr(os, "O_BINARY", 0))
    with os.fdopen(fd, "rb") as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or signature(info) != expected:
            raise OSError("File changed since the scan; scan again.")
        digest = hashlib.sha256()
        while True:
            check_cancel(cancel)
            block = stream.read(256 * 1024 if quick else 1024 * 1024)
            if not block:
                break
            digest.update(block)
            if quick:
                break
        if signature(os.fstat(stream.fileno())) != expected:
            raise OSError("File changed while being read; scan again.")
    if signature(os.lstat(path)) != expected:
        raise OSError("File changed while being read; scan again.")
    return digest.hexdigest()


def scan_duplicates(roots, file_types, progress=None, cancel=None, summary=None):
    summary = summary if summary is not None else {}
    summary.update(skipped=0, totalFiles=0, roots=roots)
    sizes = defaultdict(list)
    seen = set()
    last_report = 0
    def report(value, message, force=False):
        nonlocal last_report
        now = time.monotonic()
        if progress and (force or now - last_report > .2):
            progress({"value": value, "message": message, "totalFiles": summary["totalFiles"]})
            last_report = now
    report(0, "Discovering files across the filesystem…", True)
    for path, info in walk_files(roots, summary, cancel):
        if not file_type_allowed(path, file_types):
            continue
        # Hard links share storage; removing one cannot reclaim another copy's size.
        identity = (info.st_dev, info.st_ino) if info.st_ino else path
        if identity in seen:
            continue
        seen.add(identity)
        summary["totalFiles"] += 1
        sizes[info.st_size].append({"path": path, "size": info.st_size,
                                    "lastModified": info.st_mtime_ns // 1_000_000,
                                    "signature": signature(info)})
        report(5, f"Discovered {summary['totalFiles']:,} files · {path}")
    candidates = [file for group in sizes.values() if len(group) > 1 for file in group]
    quick_groups = defaultdict(list)
    for i, file in enumerate(candidates):
        check_cancel(cancel)
        try:
            digest = hash_path(file["path"], file["signature"], quick=True, cancel=cancel)
            quick_groups[(file["size"], digest)].append(file)
        except OSError:
            summary["skipped"] += 1
        report(10 + 35 * (i + 1) / len(candidates), f"Checking file samples {i + 1:,}/{len(candidates):,}")
    candidates = [file for group in quick_groups.values() if len(group) > 1 for file in group]
    full_groups = defaultdict(list)
    for i, file in enumerate(candidates):
        check_cancel(cancel)
        try:
            digest = hash_path(file["path"], file["signature"], cancel=cancel)
            full_groups[(file["size"], digest)].append(file)
        except OSError:
            summary["skipped"] += 1
        report(45 + 54 * (i + 1) / len(candidates), f"Verifying full contents {i + 1:,}/{len(candidates):,}")
    check_cancel(cancel)
    duplicates = [{"id": str(i), "hash": digest, "files": sorted(files, key=lambda f: (f["lastModified"], f["path"]))}
                  for i, ((_, digest), files) in enumerate(full_groups.items(), 1) if len(files) > 1]
    report(100, f"Found {len(duplicates):,} duplicate groups.", True)
    return duplicates, summary["totalFiles"]


def recycle_paths(paths, scan_id):
    """Only trash verified duplicates, retaining a verified copy in each group."""
    if not scan_id or scan_id != LAST_SCAN_ID:
        raise ValueError("Results are outdated. Scan again before deleting.")
    if not HAS_SEND2TRASH:
        raise ValueError("Install send2trash to enable deletion: pip install -r requirements.txt")
    requested = set(paths)
    moved, errors = [], []
    known = {file["path"] for group in LAST_SCAN_GROUPS for file in group["files"]}
    errors.extend({"path": path, "error": "Not a duplicate in the last scan."} for path in requested - known)
    for group in LAST_SCAN_GROUPS:
        selected = [file for file in group["files"] if file["path"] in requested]
        if not selected:
            continue
        remaining = [file for file in group["files"] if file["path"] not in requested]
        keeper = None
        for file in remaining:
            try:
                if hash_path(file["path"], file["signature"]) == group["hash"]:
                    keeper = file
                    break
            except OSError:
                pass
        if keeper is None:
            errors.extend({"path": file["path"], "error": "Keep at least one unchanged copy in this group. Scan again."} for file in selected)
            continue
        for file in selected:
            path = file["path"]
            try:
                if hash_path(path, file["signature"]) != group["hash"]:
                    raise OSError("File content changed; scan again.")
                # The retained copy must still exist immediately before moving each file.
                if signature(os.lstat(keeper["path"])) != keeper["signature"]:
                    raise OSError("The copy to keep changed; scan again.")
                if signature(os.lstat(path)) != file["signature"]:
                    raise OSError("File changed; scan again.")
                send2trash(path)
                moved.append(path)
                LAST_SCAN_PATHS.discard(path)
            except Exception as error:
                errors.append({"path": path, "error": str(error)})
    return {"moved": moved, "errors": errors}


def start_scan(roots, file_types):
    global SCAN_STATE, SCAN_CANCEL, LAST_SCAN_ID, LAST_SCAN_GROUPS
    if not OPERATION_LOCK.acquire(blocking=False):
        raise ValueError("A scan or deletion is already running.")
    scan_id = uuid.uuid4().hex
    cancel = threading.Event()
    with STATE_LOCK:
        SCAN_CANCEL = cancel
        SCAN_STATE = {"scanId": scan_id, "status": "scanning", "progress": {"value": 0, "message": "Preparing scan…"}}
        LAST_SCAN_ID = None
        LAST_SCAN_GROUPS = []
        LAST_SCAN_PATHS.clear()
    def update(progress):
        with STATE_LOCK:
            SCAN_STATE["progress"] = progress
    def work():
        global LAST_SCAN_ID, LAST_SCAN_GROUPS
        try:
            summary = {}
            duplicates, total = scan_duplicates(roots, file_types, update, cancel, summary)
            with STATE_LOCK:
                check_cancel(cancel)
                LAST_SCAN_GROUPS = duplicates
                LAST_SCAN_PATHS.update(file["path"] for group in duplicates for file in group["files"])
                LAST_SCAN_ID = scan_id
                # File identity details stay on the server.
                public = [{**group, "files": [{key: value for key, value in file.items() if key != "signature"}
                                               for file in group["files"]]} for group in duplicates]
                SCAN_STATE.update(status="complete", duplicates=public, totalFiles=total,
                                  skipped=summary["skipped"], roots=roots)
        except ScanCancelled:
            with STATE_LOCK:
                SCAN_STATE.update(status="cancelled")
        except Exception as error:
            with STATE_LOCK:
                SCAN_STATE.update(status="error", error=str(error))
        finally:
            OPERATION_LOCK.release()
    threading.Thread(target=work, daemon=True).start()
    return scan_id


def cors_headers(handler):
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")


def send_json(handler, code, data):
    body = json.dumps(data).encode("utf-8")
    handler.send_response(code)
    cors_headers(handler)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(body)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(UI_ROOT), **kwargs)

    def do_OPTIONS(self):
        self.send_response(204)
        cors_headers(self)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/clonecutter-health":
            send_json(self, 200, {"ok": True, "canTrash": HAS_SEND2TRASH, "filesystemScan": True})
            return
        if parsed.path == "/api/scan":
            scan_id = parse_qs(parsed.query).get("id", [None])[0]
            with STATE_LOCK:
                state = dict(SCAN_STATE) if scan_id and scan_id == SCAN_STATE.get("scanId") else None
            send_json(self, 200 if state else 404, state or {"error": "Scan no longer available. Start a new scan."})
            return
        if parsed.path == "/api/preview":
            path = parse_qs(parsed.query).get("path", [None])[0]
            if path not in LAST_SCAN_PATHS or os.path.islink(path):
                self.send_error(403)
                return
            try:
                # Stream previews rather than loading an entire video into memory.
                with open(path, "rb") as stream:
                    self.send_response(200)
                    cors_headers(self)
                    self.send_header("Content-Type", mimetypes.guess_type(path)[0] or "application/octet-stream")
                    self.send_header("Content-Length", str(os.fstat(stream.fileno()).st_size))
                    self.send_header("Cache-Control", "no-store")
                    self.end_headers()
                    while block := stream.read(1024 * 1024):
                        self.wfile.write(block)
            except (OSError, BrokenPipeError):
                pass
            return
        if not (UI_ROOT / "index.html").is_file():
            send_json(self, 503, {"error": "Build the UI with npm run build, or use npm run dev."})
            return
        super().do_GET()

    def do_POST(self):
        route = urlparse(self.path).path
        if route not in {"/api/scan", "/api/scan/cancel", "/api/move"}:
            self.send_error(404)
            return
        try:
            data = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))) or b"{}")
            if not isinstance(data, dict):
                raise ValueError("Expected a JSON object.")
            if route == "/api/scan":
                roots = filesystem_roots() if data.get("scope", "filesystem") == "filesystem" else data.get("roots")
                types = data.get("file_types", ["all"])
                if not isinstance(roots, list) or not roots or any(not isinstance(r, str) or not os.path.isabs(r) for r in roots):
                    raise ValueError("Provide absolute scan roots.")
                if not isinstance(types, list) or not types or any(t not in {*EXTENSIONS, "all"} for t in types):
                    raise ValueError("Select at least one valid file type.")
                send_json(self, 202, {"scanId": start_scan(roots, types)})
            elif route == "/api/scan/cancel":
                with STATE_LOCK:
                    if data.get("scanId") != SCAN_STATE.get("scanId"):
                        raise ValueError("Scan no longer available.")
                    SCAN_CANCEL.set()
                send_json(self, 200, {"ok": True})
            else:
                paths = data.get("paths")
                if not isinstance(paths, list) or not paths or any(not isinstance(p, str) for p in paths):
                    raise ValueError("Select duplicate paths to delete.")
                if not OPERATION_LOCK.acquire(blocking=False):
                    raise ValueError("A scan or deletion is already running.")
                try:
                    result = recycle_paths(paths, data.get("scanId"))
                finally:
                    OPERATION_LOCK.release()
                send_json(self, 200, result)
        except (ValueError, TypeError) as error:
            send_json(self, 400, {"error": str(error)})
        except Exception as error:
            send_json(self, 500, {"error": str(error)})


def main():
    port = int(os.environ.get("PORT", "8765"))
    host = os.environ.get("HOST", "127.0.0.1")
    httpd = ThreadingHTTPServer((host, port), Handler)
    print(f"CloneCutter: http://{host}:{port}/")
    print("Scans the filesystem of this computer using your account's permissions.")
    if not HAS_SEND2TRASH:
        print("Install deletion support: pip install -r requirements.txt", file=sys.stderr)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        SCAN_CANCEL.set()
        print("\nStopped.")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
