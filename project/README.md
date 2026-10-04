# CloneCutter

Find identical files across the filesystem of the computer running CloneCutter's local server. No folder picker is required.

## Run locally

From this directory:

```sh
npm install
npm run build
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python server.py
```

Open http://127.0.0.1:8765. On Windows, use `.venv\Scripts\pip` and `.venv\Scripts\python` for the last two commands.

For development, keep the Python server running and run `npm run dev` in another terminal. Vite forwards `/api` requests to the server.

## Scan and delete copies

1. Click **Scan filesystem**. All file types are included by default; filters can narrow the scan.
2. Review matching groups with filenames, full paths, sizes, and modification dates. The oldest copy is marked **Keep** by default; choose another retained copy if needed.
3. Check individual **Delete** boxes, or click **Select all copies** to select every extra copy while preserving the retained file in each group.
4. Click **Delete selected** and confirm. Files go to the system Trash / Recycle Bin. Restore them there if needed.

The server scans `/` on Linux/macOS (including mounted drives) and available drive letters on Windows, using the current account's permissions. It skips virtual system directories (`/proc`, `/sys`, `/dev`, `/run`), symbolic links, Trash directories, and inaccessible paths. Hard links are counted once because they share storage. Whole-filesystem scans can take a while; progress and cancellation are available.

Duplicates are matched by size, a sample hash, and a full SHA-256 hash. Before deletion, the server checks that selected files and at least one retained copy are unchanged. Changed files, outdated results, and requests that remove every copy are rejected. Files used by installed software may also appear in a whole-filesystem scan; review their paths before selecting them.

After deletion, successfully moved files are removed from the results without repeating the filesystem scan. The UI's **Total space cleared** tracks the total size and number of copies successfully moved during the current page session, across deletion batches and scans. Failed deletions are excluded. These files still occupy space in Trash; empty your system's Trash to reclaim disk space. Reloading the page resets the session total. Scan again to include new or changed files.

A browser alone cannot access the whole filesystem; the local server must be running. An optional `VITE_CLONECUTTER_API` setting points the UI at a different server; the scan then covers that server's computer.

## Validate

```sh
npm test
npm run build
```

Tests use temporary files and a simulated Trash operation. They never scan the host filesystem or delete personal files.
