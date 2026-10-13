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
  return groups.map((group) => ({ ...group, deleteIndices: [] }));
}

export function copiesToRemove(groups) {
  return groups.flatMap((group) => {
    const selected = group.files.filter((_, index) => group.deleteIndices.includes(index));
    return selected.length < group.files.length ? selected : [];
  });
}

export function setCopyDelete(group, index, checked) {
  if (!group.files[index]) return group;
  const deleteIndices = checked
    ? [...new Set([...group.deleteIndices, index])]
    : group.deleteIndices.filter((value) => value !== index);
  if (deleteIndices.length >= group.files.length) return group;
  return { ...group, deleteIndices };
}

export function selectGroupCopies(group, checked) {
  if (!checked) return { ...group, deleteIndices: [] };
  // Preserve manual choices, leaving the oldest unselected copy in each group.
  const remaining = group.files.flatMap((file, index) => group.deleteIndices.includes(index) ? [] : [{ file, index }]);
  const keepIndex = remaining.length
    ? remaining[pickKeepIndex(remaining.map(({ file }) => file))].index : pickKeepIndex(group.files);
  return { ...group, deleteIndices: group.files.map((_, index) => index).filter((index) => index !== keepIndex) };
}

export function removeMovedFiles(group, moved) {
  const files = group.files.filter((file) => !moved.has(file.path));
  return { ...group, files, deleteIndices: [] };
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
