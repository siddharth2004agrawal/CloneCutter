# CloneCutter

Find identical files in selected folders or across the filesystem of the computer running CloneCutter's local server.

## Run locally

Install dependencies once from this directory:

```sh
npm install
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

On Windows, create and install the Python dependencies with:

```powershell
py -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
```

Then start the React app and local file server together with one command:

```sh
npm run dev
```

Open the Vite address shown in the terminal (usually http://127.0.0.1:5173). The terminal labels output from each process; press **Ctrl+C** to stop both. Vite forwards `/api` requests to the local server. Set `PYTHON` if you want the launcher to use a specific Python executable; it automatically uses `.venv` when available.

To run only the React UI during frontend work, use `npm run dev:web`.

For a built, standalone app, run `npm run build` and then `.venv/bin/python server.py` (on Windows, `.venv\Scripts\python server.py`). Open http://127.0.0.1:8765.

Native folder selection opens on the computer running the local server. Start the server in your desktop session. Linux uses Zenity or KDialog (preferring KDialog on KDE), with Python Tk as a fallback; install `zenity`, `kdialog`, or `python3-tk` if none is available. Windows and macOS use Python Tk's native system folder dialog, so your Python installation needs Tk support.

If folder selection reports a connection error, stop the existing dev process with **Ctrl+C**, run `npm run dev` again from this directory, and reload the HTTP address printed by Vite. This starts both the UI and Python server; `npm run dev:web` starts only the UI. Restart after backend changes so the running server includes the latest folder picker API. The app checks for native picker support before opening the dialog and reports connection or desktop errors directly.

## Scan and delete copies

1. Click **Find my duplicates** on the landing page to reach the scan setup. Choose **Entire computer**, or choose **Selected folders** and click **Choose folders** to open your operating system's native folder picker. Browse to a folder and confirm the selection to add it directly to the scan list. Cancel leaves your selections unchanged. Use **Add another folder** to select more locations, then click **Find duplicates**. All subfolders and file types are included by default; filters can narrow the scan.
2. After the scan, review the duplicate files with filenames, full paths, sizes, and modification dates. Nothing is selected for deletion initially.
3. Check the **Delete** boxes for the files you want to remove, or check **Select all** to select every extra copy across all result pages. Unselected files stay where they are. At least one identical copy must remain in each group. Select all leaves the oldest unselected copy in each group and preserves your existing manual selections. Uncheck individual files or use **Clear selection** to change your selection.
4. Click **Delete selected** and review the confirmation showing the selected count, total size, and up to ten file paths. Confirm to move the chosen files to **Recycle Bin** on Windows or **Trash** on macOS/Linux. The local server uses `send2trash` to perform the native operation. If Trash access fails, the file stays in place and an error is shown. Restore moved files from the operating system’s Trash / Recycle Bin if needed.

Search results by any filename or full path. Sort duplicate groups by space to reclaim, number of copies, or filename. The **Select all** checkbox applies to every group matching the current search and preserves selections outside that search. **Export CSV** downloads a review sheet of every duplicate file, including its full path, size, modification time, duplicate hash, and deletion selection status.

The server scans `/` on Linux/macOS (including mounted drives) and available drive letters on Windows, using the current account's permissions. It skips virtual system directories (`/proc`, `/sys`, `/dev`, `/run`), symbolic links, Trash directories, and inaccessible paths. Hard links are counted once because they share storage. Whole-filesystem scans can take a while; progress and cancellation are available. Scan progress shows elapsed time and an estimated time remaining based on the amount of candidate data and observed reading speed. The estimate displays **Calculating…** during folder discovery and until there is enough reading activity, then adjusts as sampling rules out files and drive speed changes. It is approximate, including on external drives.

Selected-folder scans include all subfolders and find duplicates both within and across selected folders. Only files in those locations appear in the results and can be selected for deletion. Overlapping folder selections do not count files twice. Folder selection uses the local server's filesystem, so it also works when the browser cannot provide absolute paths or deletion access. Missing folders, symbolic links, virtual system folders, and Trash cannot be selected as scan roots.

Duplicates are matched by size, a sample hash, and a full SHA-256 hash. Copying and pasting a file into the same folder is supported: filenames such as `photo.jpg`, `photo (copy).jpg`, and `photo (2).jpg` match when their contents are identical, regardless of modification dates. Empty files, hidden files, and files without extensions are included when **All Files** is selected. File metadata is checked consistently within each filesystem API, avoiding false “file changed” errors from differing path and open-file timestamps on some Python/Windows versions. Before deletion, the server checks that selected files and at least one retained copy are unchanged. Changed files, outdated results, and requests that remove every copy are rejected. Files used by installed software may also appear in a whole-filesystem scan; review their paths before selecting them.

Completed scans bring the results into view. If expected copies are missing, check the scanned folders and any file-type filter notice. Unreadable or changed paths appear in an expandable list (up to 20 examples); a scan with skipped paths does not claim those locations are duplicate-free. Use **All Files** to avoid excluding copies by extension, and scan again after any copy operation finishes. Files that only look similar after editing or re-encoding are not exact duplicates.

After deletion, successfully moved files are removed from the results without repeating the filesystem scan. The UI's **Total space cleared** tracks the total size and number of copies successfully moved during the current page session, across deletion batches and scans. Failed deletions are excluded. These files still occupy space in Trash; empty your system's Trash to reclaim disk space. Reloading the page resets the session total. Scan again to include new or changed files.

A browser alone cannot access the whole filesystem; the local server must be running. An optional `VITE_CLONECUTTER_API` setting points the UI at a different server; the scan then covers that server's computer.

## Validate

```sh
npm test
npm run build
```

Tests use temporary files, simulated native picker responses, and a simulated Trash operation. They never open desktop dialogs, scan the host filesystem, or delete personal files.
