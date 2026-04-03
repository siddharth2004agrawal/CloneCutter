const EXTENSIONS = {
  image: new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'tif', 'heic', 'heif', 'avif']),
  video: new Set(['mp4', 'mkv', 'mov', 'avi', 'webm', 'wmv', 'flv', 'm4v', '3gp']),
  audio: new Set(['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma']),
  document: new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'csv', 'md']),
  archive: new Set(['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz']),
};

function getExt(path) {
  const base = path.split('/').pop() || '';
  const idx = base.lastIndexOf('.');
  if (idx === -1) return '';
  return base.slice(idx + 1).toLowerCase();
}

function fileTypeAllowed(path, fileTypes) {
  if (!fileTypes || fileTypes.length === 0) return true;
  if (fileTypes.includes('all')) return true;
  const ext = getExt(path);
  for (const type of fileTypes) {
    const set = EXTENSIONS[type];
    if (set && set.has(ext)) return true;
  }
  return false;
}

function hexFromBuffer(buf) {
  const bytes = new Uint8Array(buf);
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

async function sha256(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return hexFromBuffer(digest);
}

async function quickHash(file) {
  // Hash first 256KB + size for fast bucketing
  const chunkSize = 256 * 1024;
  const slice = file.slice(0, chunkSize);
  const buf = await slice.arrayBuffer();
  const h = await sha256(buf);
  return `${file.size}:${h}`;
}

function postProgress(progress, message) {
  self.postMessage({ type: 'progress', progress, message });
}

self.onmessage = async (e) => {
  const data = e.data;
  if (!data || data.action !== 'scan') return;

  try {
    const filesIn = Array.isArray(data.files) ? data.files : [];
    const fileTypes = Array.isArray(data.fileTypes) ? data.fileTypes : ['all'];

    const candidates = [];
    for (const f of filesIn) {
      if (!f || !f.path) continue;
      if (!f.handle && !f.file) continue;
      if (!fileTypeAllowed(f.path, fileTypes)) continue;
      candidates.push(f);
    }

    postProgress(0, `Collecting metadata for ${candidates.length.toLocaleString()} files…`);

    // Phase 1: group by size+quickHash(first 256KB)
    const buckets = new Map();
    let done = 0;

    for (const f of candidates) {
      const file = f.file || (await f.handle.getFile());
      const qh = await quickHash(file);
      const key = qh;
      const entry = {
        path: f.path,
        handle: f.handle,
        file: f.file,
        size: file.size,
        lastModified: file.lastModified,
        _qh: qh,
      };
      const arr = buckets.get(key) || [];
      arr.push(entry);
      buckets.set(key, arr);

      done += 1;
      if (done % 25 === 0) {
        const p = Math.round((done / candidates.length) * 60);
        postProgress(p, `Quick hashing… ${done.toLocaleString()}/${candidates.length.toLocaleString()}`);
      }
    }

    const maybeDupGroups = Array.from(buckets.values()).filter((g) => g.length > 1);
    postProgress(65, `Verifying ${maybeDupGroups.length.toLocaleString()} potential duplicate group(s)…`);

    // Phase 2: full SHA-256 for only potential duplicates
    const fullMap = new Map(); // fullHash -> files
    let verifyDone = 0;

    for (const group of maybeDupGroups) {
      for (const entry of group) {
        const file = entry.file || (await entry.handle.getFile());
        const buf = await file.arrayBuffer();
        const fh = await sha256(buf);
        const list = fullMap.get(fh) || [];
        list.push({
          path: entry.path,
          handle: entry.handle,
          file: entry.file,
          size: entry.size,
          lastModified: entry.lastModified,
        });
        fullMap.set(fh, list);
      }

      verifyDone += 1;
      const p = 65 + Math.round((verifyDone / Math.max(1, maybeDupGroups.length)) * 30);
      postProgress(p, `Full hashing… ${verifyDone.toLocaleString()}/${maybeDupGroups.length.toLocaleString()} groups`);
    }

    const duplicates = [];
    let id = 1;
    for (const [hash, files] of fullMap.entries()) {
      if (files.length > 1) {
        duplicates.push({ id: String(id++), hash, files });
      }
    }

    postProgress(100, `Done. Found ${duplicates.length.toLocaleString()} duplicate group(s).`);
    self.postMessage({ type: 'complete', duplicates, totalFiles: candidates.length });
  } catch (err) {
    console.error(err);
    self.postMessage({ type: 'error', message: err?.message || String(err) });
  }
};

