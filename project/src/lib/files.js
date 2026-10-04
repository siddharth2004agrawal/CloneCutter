export const FILE_TYPES = [
  ['image', 'Images'],
  ['video', 'Videos'],
  ['audio', 'Audio'],
  ['document', 'Documents'],
  ['archive', 'Archives'],
  ['all', 'All Files'],
];

export function basename(path) {
  return String(path).replaceAll('\\', '/').split('/').pop() || '';
}

export function getExt(path) {
  const name = basename(path);
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i + 1).toLowerCase();
}

export function formatBytes(bytes = 0) {
  const b = Number(bytes);
  if (!Number.isFinite(b) || b <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
  const val = b / 1024 ** i;
  return `${val.toFixed(val >= 100 || i === 0 ? 0 : val >= 10 ? 1 : 2)} ${units[i]}`;
}

export function formatDate(ms) {
  return ms ? new Date(ms).toLocaleString() : '—';
}

export function pickKeepIndex(files, type = 'oldest') {
  return files.reduce((best, file, i) => {
    const current = file.lastModified ?? (type === 'oldest' ? Infinity : 0);
    const previous = files[best]?.lastModified ?? (type === 'oldest' ? Infinity : 0);
    return (type === 'oldest' ? current < previous : current > previous) ? i : best;
  }, 0);
}

export function initializeGroups(groups) {
  return groups.map((group) => ({ ...group, selectedIndex: pickKeepIndex(group.files) }));
}

export function copiesToRemove(groups) {
  return groups.flatMap((group) => group.files.filter((_, i) => i !== group.selectedIndex));
}

export async function readFolderFiles(handle, folderId, prefix = handle.name) {
  const files = [];
  for await (const entry of handle.values()) {
    const path = `${prefix}/${entry.name}`;
    if (entry.kind === 'directory') {
      files.push(...await readFolderFiles(entry, folderId, path));
    } else {
      files.push({ id: `${folderId}/${path}`, path, handle: entry, parentHandle: handle, fileName: entry.name });
    }
  }
  return files;
}

export async function countFiles(handle) {
  let count = 0;
  for await (const entry of handle.values()) {
    count += entry.kind === 'file' ? 1 : await countFiles(entry);
  }
  return count;
}
