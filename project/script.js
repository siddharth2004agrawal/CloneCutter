/* global FileSystemDirectoryHandle, FileSystemFileHandle */

class CloneCutter {
  constructor() {
    this.folders = [];
    this.duplicates = [];
    this.worker = null;
    this.trash = [];
    this._thumbUrls = [];
    this.serverRoots = [];
    this.serverApiAvailable = false;
    this.lastScanWasServer = false;
    this.apiBase =
      typeof window !== 'undefined' && window.__CLONECUTTER_API__ != null ? String(window.__CLONECUTTER_API__) : '';
    this._deleteInProgress = false;
    void this.init();
  }

  async init() {
    this.bindEvents();
    await this.probeServerApi();
    this.checkEnvironment();
    this.renderServerPathList();
    this.updateDeleteSupportNote();
    this.updateStartButton();
  }

  async probeServerApi() {
    const candidates = [];
    if (this.apiBase) candidates.push(this.apiBase);
    candidates.push('');
    if (!this.apiBase) candidates.push('http://127.0.0.1:8765');

    this.serverApiAvailable = false;
    for (const base of candidates) {
      try {
        const r = await fetch(`${base}/api/clonecutter-health`, { method: 'GET' });
        if (r.ok) {
          this.serverApiAvailable = true;
          this.apiBase = base;
          break;
        }
      } catch {
        /* try next */
      }
    }

    const st = document.getElementById('serverStatus');
    if (st) {
      if (this.serverApiAvailable) {
        st.textContent =
          'Local API connected — add folder paths below, Start scan, then remove duplicates (Recycle Bin).';
        st.classList.add('ok');
      } else {
        st.textContent =
          'Start CloneCutter: run `pip install -r requirements.txt` then `python server.py`, or set window.__CLONECUTTER_API__ to your API URL.';
        st.classList.remove('ok');
      }
    }
  }

  /** @returns {boolean} True if File System Access API directory picker is available (Chromium-based browsers). */
  isFileSystemAccessSupported() {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  }

  /**
   * @param {{ files?: Array<{ lastModified?: number }> }} group
   * @returns {number} Index of file with earliest lastModified.
   */
  keepOldest(group) {
    return this.pickKeepIndex(group.files || []);
  }

  /**
   * @param {{ files?: Array<{ lastModified?: number }> }} group
   * @returns {number} Index of file with latest lastModified.
   */
  keepNewest(group) {
    return this.pickNewestIndex(group.files || []);
  }

  /**
   * @param {'newest' | 'oldest'} type
   */
  applySelectionToAllGroups(type) {
    this.duplicates.forEach((group) => {
      const files = group.files || [];
      if (files.length <= 1) return;
      group.selectedIndex = type === 'newest' ? this.keepNewest(group) : this.keepOldest(group);
      this.syncSelectionMetadata(group);
    });
    this.renderResults();
  }

  /**
   * Keeps `selectedIndex` (0-based) and `selectedId` (path of file to keep) in sync.
   * @param {{ files?: Array<{ path?: string }>, selectedIndex?: number }} group
   */
  syncSelectionMetadata(group) {
    const files = group.files || [];
    if (files.length === 0) {
      group.selectedIndex = 0;
      group.selectedId = null;
      return;
    }
    let idx = Number.isFinite(group.selectedIndex) ? group.selectedIndex : this.keepOldest(group);
    idx = Math.max(0, Math.min(idx, files.length - 1));
    group.selectedIndex = idx;
    group.selectedId = files[idx] && files[idx].path != null ? files[idx].path : null;
  }

  /**
   * Ensures each group has `selectedIndex` and `selectedId` (file to keep).
   * @param {Array} groups
   */
  initializeDuplicateGroups(groups) {
    return (groups || []).map((g) => {
      const next = { ...g };
      this.syncSelectionMetadata(next);
      return next;
    });
  }

  /** True if any folder was added via webkitdirectory fallback (scan-only for browser delete). */
  scanOnlyMode() {
    return this.folders.some((f) => f.mode === 'filelist');
  }

  /**
   * Whether the user can delete duplicates with the current scan/source setup.
   */
  isDeleteAllowed() {
    if (this.lastScanWasServer && this.serverApiAvailable) return true;
    if (!this.isFileSystemAccessSupported()) return false;
    if (this.scanOnlyMode()) return false;
    return this.folders.some((f) => f.mode === 'handles');
  }

  updateDeleteSupportNote() {
    const el = document.getElementById('deleteSupportNote');
    if (!el) return;

    if (this.lastScanWasServer && this.serverApiAvailable) {
      el.classList.add('hidden');
      el.textContent = '';
      return;
    }

    if (!this.isFileSystemAccessSupported()) {
      el.classList.remove('hidden');
      el.textContent =
        'Deletion not supported in this browser. Use Chrome, Edge, or Brave. You can still scan and choose which copy to keep.';
      return;
    }

    if (this.scanOnlyMode()) {
      el.classList.remove('hidden');
      el.textContent =
        'Scan-only mode: folders were added with “Choose folder (fallback)”. Deletion is disabled. Use “Select Folders” for full delete, or run python server.py for server-side delete.';
      return;
    }

    el.classList.add('hidden');
    el.textContent = '';
  }

  checkEnvironment() {
    const warn = document.getElementById('envWarning');
    const fallbackBtn = document.getElementById('selectFoldersFallback');
    const serverPanel = document.getElementById('serverPanel');
    const isFile = window.location.protocol === 'file:';
    const secure = typeof window.isSecureContext !== 'boolean' || window.isSecureContext === true;
    const noPicker = typeof window.showDirectoryPicker !== 'function';

    const showWarn = isFile || noPicker || !secure;

    if (serverPanel) {
      const showServerHelp = this.serverApiAvailable || noPicker;
      serverPanel.classList.toggle('hidden', !showServerHelp);
    }

    if (showWarn) {
      warn.classList.remove('hidden');
      let html = '<strong>Folder picker needs the right context.</strong> ';
      if (isFile) {
        html +=
          'Do not open the page as <code>file://</code>. Run <code>python server.py</code> or a static server and open <code>http://127.0.0.1:…</code>. ';
      } else if (!secure) {
        html += 'Use <code>https://</code> or <code>http://localhost</code> / <code>http://127.0.0.1</code> (secure context). ';
      }
      if (noPicker) {
        html +=
          'This browser may not expose <code>showDirectoryPicker</code> (e.g. Brave). <strong>Run <code>python server.py</code></strong> and use <strong>Server mode</strong> below for scanning and Recycle Bin delete. ';
      }
      html +=
        '<strong>Choose folder (fallback)</strong> only scans in-browser; for system delete use <strong>Server mode</strong> or <strong>Select Folders</strong> in Chrome/Edge.';
      warn.innerHTML = html;
      if (fallbackBtn) fallbackBtn.classList.remove('hidden');
    } else {
      warn.classList.add('hidden');
      if (fallbackBtn) fallbackBtn.classList.add('hidden');
    }
  }

  bindEvents() {
    document.getElementById('selectFolders').addEventListener('click', () => this.selectFolder());
    const fallbackBtn = document.getElementById('selectFoldersFallback');
    const fallbackInput = document.getElementById('folderFallbackInput');
    if (fallbackBtn && fallbackInput) {
      fallbackBtn.addEventListener('click', () => fallbackInput.click());
      fallbackInput.addEventListener('change', (e) => this.onFallbackFolderChosen(e));
    }
    document.getElementById('startScan').addEventListener('click', () => this.startScan());

    const resultsSection = document.getElementById('resultsSection');
    resultsSection.addEventListener('click', (e) => {
      const t = e.target;
      if (!t || !t.closest) return;
      if (t.closest('#keepOldest')) {
        e.preventDefault();
        this.applySelectionToAllGroups('oldest');
        return;
      }
      if (t.closest('#keepNewest')) {
        e.preventDefault();
        this.applySelectionToAllGroups('newest');
        return;
      }
      if (t.closest('#removeSelected')) {
        e.preventDefault();
        void this.removeSelected();
      }
    });

    resultsSection.addEventListener('change', (e) => {
      const t = e.target;
      if (t && t.matches && t.matches('input.keep-radio')) {
        const gIdx = parseInt(t.getAttribute('data-group-idx'), 10);
        const idx = parseInt(t.value, 10);
        if (this.duplicates[gIdx]) {
          this.duplicates[gIdx].selectedIndex = idx;
          this.syncSelectionMetadata(this.duplicates[gIdx]);
        }
        this.updateRemoveButton();
      }
    });

    document.querySelector('.file-types').addEventListener('change', (e) => {
      if (e.target && e.target.value === 'all') {
        this.toggleAllFileTypes(e.target.checked);
      }
      this.updateStartButton();
    });

    const addBtn = document.getElementById('serverAddPathBtn');
    const pathInput = document.getElementById('serverPathInput');
    if (addBtn && pathInput) {
      addBtn.addEventListener('click', () => this.addServerPath(pathInput.value));
      pathInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.addServerPath(pathInput.value);
        }
      });
    }
  }

  addServerPath(raw) {
    const t = String(raw || '').trim();
    if (!t) return;
    if (this.serverRoots.includes(t)) return;
    this.serverRoots.push(t);
    const inp = document.getElementById('serverPathInput');
    if (inp) inp.value = '';
    this.renderServerPathList();
    this.updateStartButton();
  }

  removeServerPath(idx) {
    this.serverRoots.splice(idx, 1);
    this.renderServerPathList();
    this.updateStartButton();
  }

  renderServerPathList() {
    const ul = document.getElementById('serverPathList');
    if (!ul) return;
    ul.innerHTML = this.serverRoots
      .map(
        (p, i) => `
      <li>
        <span>${this.escapeHtml(p)}</span>
        <button type="button" data-server-remove="${i}">Remove</button>
      </li>`,
      )
      .join('');
    ul.querySelectorAll('button[data-server-remove]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.getAttribute('data-server-remove'), 10);
        this.removeServerPath(i);
      });
    });
  }

  async selectFolder() {
    try {
      if (!this.isFileSystemAccessSupported()) {
        alert(
          'Deletion not supported in this browser. Use Chrome, Edge, or Brave. You can still use “Choose folder (fallback)” to scan only.',
        );
        return;
      }

      if (typeof window.isSecureContext === 'boolean' && !window.isSecureContext) {
        alert(
          'Not a secure context. Serve the site over http://localhost (e.g. python -m http.server) instead of opening the file directly.',
        );
        return;
      }

      // readwrite lets us move duplicates to CloneCutter_Trash without a second permission prompt.
      let dirHandle;
      try {
        dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      } catch (first) {
        if (first && first.name === 'AbortError') return;
        dirHandle = await window.showDirectoryPicker({ mode: 'read' });
      }

      const folderInfo = await this.getFolderInfo(dirHandle);
      this.addFolder(folderInfo);
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      console.error(err);
      const hint =
        err && (err.name === 'SecurityError' || String(err.message || '').includes('secure'))
          ? '\n\nTip: Do not open index.html as file://. Run a local server and use http://localhost.'
          : '';
      alert(`Folder selection failed: ${err && err.message ? err.message : String(err)}.${hint}`);
    }
  }

  onFallbackFolderChosen(event) {
    const input = event.target;
    const list = input.files;
    if (!list || list.length === 0) return;

    const first = list[0];
    const rel = first.webkitRelativePath || first.name;
    const rootName = rel.includes('/') ? rel.slice(0, rel.indexOf('/')) : 'folder';

    const fileEntries = [];
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      const wr = f.webkitRelativePath || f.name;
      const path = wr.includes('/') ? `${rootName}/${wr.slice(wr.indexOf('/') + 1)}` : `${rootName}/${f.name}`;
      fileEntries.push({ path, file: f });
    }

    const id = `fb-${crypto.randomUUID()}`;
    this.addFolder({
      id,
      name: rootName,
      mode: 'filelist',
      handle: null,
      fileCount: fileEntries.length,
      fileEntries,
    });

    input.value = '';
  }

  async getFolderInfo(dirHandle) {
    const folderName = dirHandle.name;
    const fileCount = await this.countFiles(dirHandle);
    return { id: `dir-${crypto.randomUUID()}`, handle: dirHandle, name: folderName, fileCount, mode: 'handles' };
  }

  async countFiles(dirHandle) {
    let count = 0;
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file') count += 1;
      else if (entry.kind === 'directory') count += await this.countFiles(entry);
    }
    return count;
  }

  addFolder(folderInfo) {
    if (!folderInfo.id) folderInfo.id = `dir-${crypto.randomUUID()}`;
    const exists = this.folders.some((f) => f.id === folderInfo.id);
    if (exists) return;
    this.folders.push(folderInfo);
    this.renderFolders();
    this.updateStartButton();
  }

  renderFolders() {
    const container = document.getElementById('folderList');
    container.innerHTML = this.folders
      .map(
        (folder) => `
        <div class="folder-item">
          📁 ${this.escapeHtml(folder.name)} (${Number(folder.fileCount).toLocaleString()} files)${folder.mode === 'filelist' ? ' <span class="folder-badge">scan-only</span>' : ''}
          <button type="button" data-remove-folder-id="${this.escapeHtml(folder.id)}">Remove</button>
        </div>
      `,
      )
      .join('');

    container.querySelectorAll('button[data-remove-folder-id]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-remove-folder-id');
        this.removeFolder(id);
      });
    });
  }

  removeFolder(folderId) {
    this.folders = this.folders.filter((f) => f.id !== folderId);
    this.renderFolders();
    this.updateStartButton();
  }

  toggleAllFileTypes(checked) {
    document.querySelectorAll('.file-types input:not([value="all"])').forEach((cb) => {
      cb.checked = checked;
    });
  }

  getSelectedFileTypes() {
    const allChecked = document.querySelector('.file-types input[value="all"]').checked;
    if (allChecked) return ['all'];

    return Array.from(document.querySelectorAll('.file-types input:checked'))
      .map((cb) => cb.value)
      .filter((v) => v !== 'all');
  }

  updateStartButton() {
    const hasBrowserFolders = this.folders.length > 0;
    const hasServerRoots = this.serverApiAvailable && this.serverRoots.length > 0;
    document.getElementById('startScan').disabled = !hasBrowserFolders && !hasServerRoots;
  }

  createWorker() {
    if (this.worker) this.worker.terminate();
    this.worker = new Worker('worker.js', { type: 'module' });
    this.worker.onmessage = (e) => this.handleWorkerMessage(e.data);
    this.worker.onerror = (e) => {
      console.error('Worker error:', e);
      this.showError('Scan failed. Please try again.');
    };
  }

  async startScan() {
    const hasServerRoots = this.serverApiAvailable && this.serverRoots.length > 0;
    if (hasServerRoots) {
      return this.startScanServer();
    }

    if (this.folders.length === 0) return;

    this.lastScanWasServer = false;
    this.showProgress();
    this.createWorker();

    const fileTypes = this.getSelectedFileTypes();
    const files = [];

    for (const folder of this.folders) {
      if (folder.mode === 'filelist' && folder.fileEntries) {
        for (const e of folder.fileEntries) {
          files.push({ path: e.path, file: e.file });
        }
      } else if (folder.handle) {
        const folderFiles = await this.readFolderFiles(folder.handle, folder.name);
        files.push(...folderFiles);
      }
    }

    this.worker.postMessage({ action: 'scan', files, fileTypes });
  }

  async startScanServer() {
    if (!this.serverApiAvailable || this.serverRoots.length === 0) {
      alert('Add at least one folder path and ensure python server.py is running.');
      return;
    }

    this.lastScanWasServer = true;
    this.showProgress();
    this.updateProgress(5, 'Scanning on server…');

    try {
      const r = await fetch(`${this.apiBase}/api/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roots: this.serverRoots,
          file_types: this.getSelectedFileTypes(),
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(data.error || r.statusText || 'Scan failed');
      }
      this.duplicates = this.initializeDuplicateGroups(data.duplicates || []);
      this.totalFilesScanned = data.totalFiles ?? 0;
      this.renderResults();
      this.hideProgress();
    } catch (err) {
      console.error(err);
      this.showError(err && err.message ? err.message : 'Server scan failed. Is python server.py running?');
    }
  }

  async readFolderFiles(dirHandle, rootName) {
    const out = [];
    await this.walkDirectory(dirHandle, rootName, out);
    return out;
  }

  async walkDirectory(dirHandle, pathPrefix, out) {
    for await (const entry of dirHandle.values()) {
      const fullPath = `${pathPrefix}/${entry.name}`;
      if (entry.kind === 'file') {
        out.push({ path: fullPath, handle: entry, parentHandle: dirHandle, fileName: entry.name });
      } else if (entry.kind === 'directory') {
        await this.walkDirectory(entry, fullPath, out);
      }
    }
  }

  handleWorkerMessage(data) {
    if (!data || !data.type) return;

    switch (data.type) {
      case 'progress':
        this.updateProgress(data.progress, data.message);
        break;
      case 'complete':
        this.duplicates = this.initializeDuplicateGroups(data.duplicates || []);
        this.totalFilesScanned = data.totalFiles || 0;
        this.renderResults();
        this.hideProgress();
        break;
      case 'error':
        this.showError(data.message || 'Unknown error');
        break;
      default:
        break;
    }
  }

  showProgress() {
    document.querySelector('.upload-section').classList.add('hidden');
    document.getElementById('progressSection').classList.remove('hidden');
    document.getElementById('resultsSection').classList.add('hidden');
    this.updateProgress(0, 'Preparing scan…');
  }

  hideProgress() {
    document.getElementById('progressSection').classList.add('hidden');
    document.getElementById('resultsSection').classList.remove('hidden');
  }

  updateProgress(progress, message) {
    document.getElementById('progressFill').style.width = `${Math.max(0, Math.min(100, progress || 0))}%`;
    document.getElementById('progressText').textContent = message || '';
  }

  renderResults() {
    this.revokeThumbs();
    this.updateStats();
    const container = document.getElementById('duplicatesList');
    container.innerHTML = this.duplicates.map((group, gIdx) => this.renderDuplicateGroup(group, gIdx)).join('');

    container.querySelectorAll('.duplicate-group .group-header').forEach((hdr) => {
      hdr.addEventListener('click', () => {
        const g = hdr.closest('.duplicate-group');
        const gIdx = g && g.getAttribute('data-gidx');
        if (gIdx !== null && gIdx !== undefined) this.toggleGroup(gIdx);
      });
    });

    void this.attachThumbnails();
    this.updateDeleteSupportNote();
    this.updateRemoveButton();
  }

  revokeThumbs() {
    for (const u of this._thumbUrls) {
      try {
        URL.revokeObjectURL(u);
      } catch (_) {
        /* ignore */
      }
    }
    this._thumbUrls = [];
  }

  findFileEntryByPath(path) {
    for (const g of this.duplicates) {
      for (const f of g.files || []) {
        if (f.path === path) return f;
      }
    }
    return null;
  }

  async attachThumbnails() {
    const container = document.getElementById('duplicatesList');
    const rows = container.querySelectorAll('.file-item[data-preview-path]');
    for (const row of rows) {
      const path = row.getAttribute('data-preview-path');
      const entry = this.findFileEntryByPath(path);
      const slot = row.querySelector('.file-thumb-slot');
      if (!entry || !slot) continue;
      try {
        if (this.lastScanWasServer && entry.path) {
          const previewUrl = `${this.apiBase}/api/preview?path=${encodeURIComponent(entry.path)}`;
          const ext = this.getExt(path);
          if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif'].includes(ext)) {
            slot.innerHTML = `<img class="file-thumb" alt="" src="${previewUrl}" />`;
          } else if (['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v'].includes(ext)) {
            slot.innerHTML = `<video class="file-thumb file-thumb-video" muted playsinline preload="metadata" src="${previewUrl}"></video>`;
          } else if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(ext)) {
            slot.innerHTML = `<div class="file-thumb-placeholder" aria-hidden="true">🎵</div><audio class="file-audio-preview" controls preload="none" src="${previewUrl}"></audio>`;
          } else {
            slot.innerHTML = `<div class="file-thumb-placeholder" aria-hidden="true">📄</div>`;
          }
          continue;
        }

        const file = entry.handle ? await entry.handle.getFile() : entry.file;
        if (!file) continue;
        const mime = file.type || '';
        const ext = this.getExt(path);

        if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif'].includes(ext)) {
          const url = URL.createObjectURL(file);
          this._thumbUrls.push(url);
          slot.innerHTML = `<img class="file-thumb" alt="" src="${url}" />`;
        } else if (mime.startsWith('video/') || ['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v'].includes(ext)) {
          const url = URL.createObjectURL(file);
          this._thumbUrls.push(url);
          slot.innerHTML = `<video class="file-thumb file-thumb-video" muted playsinline preload="metadata" src="${url}"></video>`;
        } else if (mime.startsWith('audio/') || ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(ext)) {
          const url = URL.createObjectURL(file);
          this._thumbUrls.push(url);
          slot.innerHTML = `<div class="file-thumb-placeholder" aria-hidden="true">🎵</div><audio class="file-audio-preview" controls preload="none" src="${url}"></audio>`;
        } else {
          slot.innerHTML = `<div class="file-thumb-placeholder" aria-hidden="true">📄</div>`;
        }
      } catch (err) {
        console.warn('Preview failed', path, err);
        slot.innerHTML = `<div class="file-thumb-placeholder" aria-hidden="true">📄</div>`;
      }
    }
  }

  getExt(path) {
    const norm = String(path).replace(/\\/g, '/');
    const base = norm.split('/').pop() || '';
    const i = base.lastIndexOf('.');
    return i === -1 ? '' : base.slice(i + 1).toLowerCase();
  }

  toggleGroup(gIdx) {
    const groupEl = document.querySelector(`.duplicate-group[data-gidx="${gIdx}"]`);
    if (!groupEl) return;
    const filesEl = groupEl.querySelector('.group-files');
    const toggleEl = groupEl.querySelector('.group-toggle');
    const isExpanded = filesEl.classList.toggle('expanded');
    toggleEl.textContent = isExpanded ? '▼' : '▶';
  }

  renderDuplicateGroup(group, gIdx) {
    const files = group.files || [];
    const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);
    const singleSize = files[0]?.size || 0;
    const spaceSaved = Math.max(0, (files.length - 1) * singleSize);
    const groupId = group.id;
    const firstName = files[0] ? this.basename(files[0].path) : 'Duplicate';
    const extra = files.length - 1;
    const extraLabel = extra === 1 ? '1 more copy' : `${extra} more copies`;
    const title = files.length > 1 ? `${this.escapeHtml(firstName)} (${extraLabel})` : this.escapeHtml(firstName);

    const selectedIndex = Number.isFinite(group.selectedIndex) ? group.selectedIndex : this.keepOldest(group);
    const hashShort = group.hash ? String(group.hash).slice(0, 14) : '—';

    return `
      <div class="duplicate-group" data-group-id="${this.escapeHtml(groupId)}" data-gidx="${gIdx}">
        <div class="group-header">
          <div class="group-info">
            <h4>${title}</h4>
            <div class="group-stats">
              ${files.length} identical files • ${this.formatBytes(totalSize)} total • save ${this.formatBytes(spaceSaved)} •
              hash ${this.escapeHtml(hashShort)}…
            </div>
          </div>
          <button class="group-toggle" type="button" data-toggle-group="${this.escapeHtml(groupId)}">▼</button>
        </div>

        <div class="group-files expanded">
          ${files
            .map((f, idx) => {
              const checked = idx === selectedIndex ? 'checked' : '';
              return `
                <div class="file-item" data-preview-path="${this.escapeHtml(f.path)}">
                  <div class="file-thumb-slot" aria-hidden="true"></div>
                  <div class="keep-cell">
                    <input
                      class="keep-radio"
                      type="radio"
                      name="dupkeep-${gIdx}"
                      value="${idx}"
                      data-keep-radio
                      data-group-idx="${gIdx}"
                      ${checked}
                    />
                    <span>Keep</span>
                  </div>
                  <div class="file-info">
                    <div class="file-name">${this.escapeHtml(this.basename(f.path))}</div>
                    <div class="file-details">${this.escapeHtml(f.path)} • ${this.formatBytes(f.size || 0)} • modified ${this.formatDate(
                      f.lastModified,
                    )}</div>
                  </div>
                  <div class="file-size">${this.formatBytes(f.size || 0)}</div>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    `;
  }

  pickKeepIndex(files) {
    if (!files || files.length === 0) return 0;
    let bestIdx = 0;
    let best = files[0]?.lastModified ?? Number.POSITIVE_INFINITY;
    for (let i = 1; i < files.length; i++) {
      const lm = files[i]?.lastModified ?? Number.POSITIVE_INFINITY;
      if (lm < best) {
        best = lm;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  pickNewestIndex(files) {
    if (!files || files.length === 0) return 0;
    let bestIdx = 0;
    let best = files[0]?.lastModified ?? 0;
    for (let i = 1; i < files.length; i++) {
      const lm = files[i]?.lastModified ?? 0;
      if (lm > best) {
        best = lm;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  updateStats() {
    const groups = this.duplicates || [];
    const totalGroups = groups.length;
    const totalFiles = this.totalFilesScanned || 0;

    let spaceSaved = 0;
    for (const g of groups) {
      const files = g.files || [];
      const size = files[0]?.size || 0;
      if (files.length > 1) spaceSaved += (files.length - 1) * size;
    }

    document.getElementById('totalDuplicates').textContent = String(totalGroups);
    document.getElementById('totalFiles').textContent = String(totalFiles);
    document.getElementById('spaceSaved').textContent = this.formatBytes(spaceSaved);
  }

  updateRemoveButton() {
    const btn = document.getElementById('removeSelected');
    const hasDupes = (this.duplicates || []).some((g) => (g.files || []).length > 1);
    const allowed = this.isDeleteAllowed();
    const busy = this._deleteInProgress;
    btn.disabled = !hasDupes || !allowed || busy;
    if (this.lastScanWasServer && this.serverApiAvailable) {
      btn.title = busy ? 'Working…' : 'Send unselected copies to the Recycle Bin (server)';
    } else if (allowed && hasDupes) {
      btn.title = busy ? 'Removing files…' : 'Permanently remove unselected duplicate files from disk';
    } else if (!this.isFileSystemAccessSupported()) {
      btn.title = 'Deletion not supported in this browser';
    } else if (this.scanOnlyMode()) {
      btn.title = 'Scan-only mode — use Select Folders to enable deletion';
    } else {
      btn.title = '';
    }
  }

  /** Paths to remove based on `group.selectedIndex` state. */
  collectPathsToDeleteFromState() {
    const toDelete = [];
    for (const group of this.duplicates) {
      const files = group.files || [];
      if (files.length <= 1) continue;
      const keepIdx = Number.isFinite(group.selectedIndex) ? group.selectedIndex : this.keepOldest(group);
      files.forEach((f, i) => {
        if (i !== keepIdx) toDelete.push(f.path);
      });
    }
    return toDelete;
  }

  /**
   * Delete unselected duplicate files using File System Access (parent.removeEntry).
   * @param {Array} groups — e.g. this.duplicates
   */
  async deleteDuplicates(groups) {
    const pathToHandle = new Map();
    for (const folder of this.folders) {
      if (folder.handle) await this.buildPathHandleMap(folder.handle, folder.name, pathToHandle);
    }
    const paths = [];
    for (const group of groups) {
      const files = group.files || [];
      if (files.length <= 1) continue;
      const keepIdx = Number.isFinite(group.selectedIndex) ? group.selectedIndex : this.keepOldest(group);
      for (let i = 0; i < files.length; i++) {
        if (i !== keepIdx) paths.push(files[i].path);
      }
    }
    const total = paths.length;
    for (let done = 0; done < paths.length; done++) {
      const filePath = paths[done];
      this.updateProgress(Math.round((done / Math.max(1, total)) * 100), `Deleting ${done + 1}/${total}…`);
      const fileInfo = pathToHandle.get(filePath);
      if (!fileInfo) {
        console.warn('Missing file handle for', filePath);
        continue;
      }
      await this.deleteFileViaHandle(fileInfo);
    }
  }

  async deleteFileViaHandle(fileInfo) {
    await fileInfo.parentHandle.removeEntry(fileInfo.fileName, { recursive: false });
  }

  async removeSelected() {
    if (!this.isDeleteAllowed()) {
      if (!this.isFileSystemAccessSupported() && !this.lastScanWasServer) {
        alert('Deletion not supported in this browser. Use Chrome, Edge, or Brave, or run python server.py for server-side delete.');
      } else if (this.scanOnlyMode()) {
        alert(
          'Scan-only mode: folders were added with “Choose folder (fallback)”. Use “Select Folders” (directory picker) to remove files, or use server mode.',
        );
      }
      return;
    }

    const toRemove = this.collectPathsToDeleteFromState();
    if (toRemove.length === 0) {
      alert('Nothing to remove: each group only has one copy, or no duplicates were found.');
      return;
    }

    const ok = confirm(
      this.lastScanWasServer
        ? `Send ${toRemove.length} file(s) to the Recycle Bin?\n\nThe copy you selected to keep in each group will not be removed.`
        : `Permanently delete ${toRemove.length} duplicate file(s) from disk?\n\nThe copy you selected to keep in each group will not be removed. This cannot be undone from the browser.`,
    );
    if (!ok) return;

    this._deleteInProgress = true;
    this.updateRemoveButton();
    document.getElementById('resultsSection')?.setAttribute('aria-busy', 'true');

    try {
      if (this.lastScanWasServer) {
        if (!this.serverApiAvailable) {
          alert('Server API is not connected. Run python server.py from the project folder.');
          return;
        }
        this.showProgress();
        this.updateProgress(0, 'Sending to Recycle Bin…');
        const r = await fetch(`${this.apiBase}/api/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths: toRemove }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || r.statusText || 'Delete failed');
        const n = (data.moved && data.moved.length) || 0;
        const errN = (data.errors && data.errors.length) || 0;
        alert(
          errN
            ? `Success: moved ${n} file(s) to Recycle Bin. ${errN} failed (see console).`
            : `Success: moved ${n} file(s) to the Recycle Bin.`,
        );
        if (data.errors && data.errors.length) console.warn(data.errors);
        this.hideProgress();
        document.querySelector('.upload-section')?.classList.add('hidden');
        document.getElementById('resultsSection')?.classList.remove('hidden');
        await this.startScanServer();
        return;
      }

      for (const folder of this.folders) {
        if (folder.handle && typeof folder.handle.requestPermission === 'function') {
          let st = 'granted';
          if (typeof folder.handle.queryPermission === 'function') {
            try {
              st = await folder.handle.queryPermission({ mode: 'readwrite' });
            } catch (_) {
              st = 'prompt';
            }
          }
          if (st === 'denied') {
            alert('Permission denied: allow read/write access to the folder when prompted.');
            return;
          }
          if (st !== 'granted') {
            const req = await folder.handle.requestPermission({ mode: 'readwrite' });
            if (req !== 'granted') {
              alert('Write permission is required to delete files. Grant access or re-select the folder.');
              return;
            }
          }
        }
      }

      this.showProgress();
      try {
        await this.deleteDuplicates(this.duplicates);
      } catch (e) {
        console.error(e);
        alert(`Failed to delete:\n${e && e.message ? e.message : String(e)}`);
        throw e;
      }

      alert(`Success: removed ${toRemove.length} duplicate file(s).`);
      this.hideProgress();
      document.querySelector('.upload-section')?.classList.add('hidden');
      document.getElementById('resultsSection')?.classList.remove('hidden');
      await this.startScan();
    } catch (err) {
      console.error(err);
      alert(`Error: ${err && err.message ? err.message : String(err)}`);
      this.showError('Deletion failed. See console for details.');
    } finally {
      this._deleteInProgress = false;
      document.getElementById('resultsSection')?.setAttribute('aria-busy', 'false');
      this.updateRemoveButton();
    }
  }

  async buildPathHandleMap(dirHandle, pathPrefix, map) {
    for await (const entry of dirHandle.values()) {
      const fullPath = `${pathPrefix}/${entry.name}`;
      if (entry.kind === 'file') {
        map.set(fullPath, { handle: entry, parentHandle: dirHandle, fileName: entry.name });
      } else if (entry.kind === 'directory') {
        await this.buildPathHandleMap(entry, fullPath, map);
      }
    }
  }

  basename(p) {
    const s = String(p).replace(/\\/g, '/');
    const idx = s.lastIndexOf('/');
    return idx === -1 ? s : s.slice(idx + 1);
  }

  showError(message) {
    alert(message);
    document.querySelector('.upload-section').classList.remove('hidden');
    document.getElementById('progressSection').classList.add('hidden');
    document.getElementById('resultsSection').classList.add('hidden');
  }

  formatBytes(bytes) {
    const b = Number(bytes || 0);
    if (!Number.isFinite(b) || b <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(units.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
    const val = b / Math.pow(1024, i);
    const digits = val >= 100 || i === 0 ? 0 : val >= 10 ? 1 : 2;
    return `${val.toFixed(digits)} ${units[i]}`;
  }

  formatDate(ms) {
    if (!ms) return '—';
    try {
      return new Date(ms).toLocaleString();
    } catch {
      return '—';
    }
  }

  escapeHtml(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
}

window.cloneCutter = new CloneCutter();