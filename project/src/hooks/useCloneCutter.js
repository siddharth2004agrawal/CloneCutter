import { useEffect, useRef, useState } from 'react';
import { discoverApi, requestJson } from '../lib/api.js';
import { copiesToRemove, countFiles, initializeGroups, pickKeepIndex, readFolderFiles } from '../lib/files.js';

export default function useCloneCutter() {
  const [folders, setFolders] = useState([]);
  const [serverRoots, setServerRoots] = useState([]);
  const [fileTypes, setFileTypes] = useState(['image', 'video', 'audio', 'document', 'archive']);
  const [api, setApi] = useState({ available: false, base: '', checking: true });
  const [duplicates, setDuplicates] = useState([]);
  const [totalFiles, setTotalFiles] = useState(0);
  const [scanSource, setScanSource] = useState(null);
  const [phase, setPhase] = useState('idle');
  const [progress, setProgress] = useState({ value: 0, message: 'Ready to scan…' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const busyRef = useRef(false);
  const workerRef = useRef(null);
  const apiProbeRef = useRef(null);
  const scanAbortRef = useRef(null);
  const sourceFilesRef = useRef(new Map());
  const mountedRef = useRef(true);
  const pickerSupported = typeof window.showDirectoryPicker === 'function';

  async function connectApi() {
    apiProbeRef.current?.abort();
    const controller = new AbortController();
    apiProbeRef.current = controller;
    setApi((previous) => ({ ...previous, checking: true }));
    try {
      const found = await discoverApi(controller.signal);
      if (!controller.signal.aborted) setApi({ ...found, checking: false });
    } catch (error) {
      if (!controller.signal.aborted) setApi({ available: false, base: '', checking: false });
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    void connectApi();
    return () => {
      mountedRef.current = false;
      apiProbeRef.current?.abort();
      scanAbortRef.current?.abort();
      if (workerRef.current) {
        workerRef.current.worker.terminate();
        workerRef.current.reject(new DOMException('Scan cancelled', 'AbortError'));
        workerRef.current = null;
      }
    };
  }, []);

  async function selectFolder() {
    if (busyRef.current) return;
    if (!pickerSupported || !window.isSecureContext) {
      setError('Use the fallback folder chooser or server mode, or open this app on localhost in Chrome/Edge.');
      return;
    }
    busyRef.current = true;
    setPhase('selecting');
    setError('');
    try {
      let handle;
      try {
        handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      } catch (first) {
        if (first.name === 'AbortError') return;
        handle = await window.showDirectoryPicker({ mode: 'read' });
      }
      for (const folder of folders) {
        if (folder.handle && await folder.handle.isSameEntry(handle)) return;
      }
      const fileCount = await countFiles(handle);
      setFolders((previous) => [...previous, {
        id: crypto.randomUUID(), name: handle.name, handle, mode: 'handles', fileCount,
      }]);
    } catch (error) {
      if (error.name !== 'AbortError') setError(`Folder selection failed: ${error.message}`);
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setPhase(scanSource ? 'results' : 'idle');
    }
  }

  function addFallbackFolder(event) {
    const input = event.target;
    const files = Array.from(input.files || []);
    if (files.length && !busyRef.current) {
      const id = crypto.randomUUID();
      const firstPath = files[0].webkitRelativePath || files[0].name;
      const name = firstPath.includes('/') ? firstPath.split('/')[0] : 'folder';
      const fileEntries = files.map((file) => {
        const path = file.webkitRelativePath || `${name}/${file.name}`;
        return { id: `${id}/${path}`, path, file };
      });
      setFolders((previous) => [...previous, { id, name, mode: 'filelist', fileCount: files.length, fileEntries }]);
    }
    input.value = '';
  }

  function addServerPath(path) {
    const trimmed = path.trim();
    if (trimmed) setServerRoots((previous) => previous.includes(trimmed) ? previous : [...previous, trimmed]);
  }

  function toggleFileType(type, checked) {
    if (type === 'all') {
      setFileTypes(checked ? ['image', 'video', 'audio', 'document', 'archive', 'all'] : []);
    } else {
      setFileTypes((previous) => checked
        ? [...new Set([...previous, type])]
        : previous.filter((value) => value !== type && value !== 'all'));
    }
  }

  function scanWithWorker(files, selectedTypes) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('../worker.js', import.meta.url), { type: 'module' });
      workerRef.current = { worker, reject };
      const finish = (callback, value) => {
        worker.terminate();
        workerRef.current = null;
        callback(value);
      };
      worker.onmessage = ({ data }) => {
        if (data.type === 'progress') setProgress({ value: data.progress, message: data.message });
        if (data.type === 'complete') finish(resolve, data);
        if (data.type === 'error') finish(reject, new Error(data.message));
      };
      worker.onerror = (event) => finish(reject, new Error(event.message || 'Scan failed. Please try again.'));
      try {
        // Parent directory handles stay on the main thread for deletion.
        worker.postMessage({
          action: 'scan',
          files: files.map(({ id, path, handle, file }) => ({ id, path, handle, file })),
          fileTypes: selectedTypes,
        });
      } catch (error) {
        finish(reject, error);
      }
    });
  }

  async function runScan(source) {
    setPhase('scanning');
    setProgress({ value: 0, message: 'Preparing scan…' });
    scanAbortRef.current = new AbortController();
    let result;
    if (source.mode === 'server') {
      setProgress({ value: 5, message: 'Scanning on server…' });
      result = await requestJson(source.base, '/api/scan', {
        roots: source.roots, file_types: source.fileTypes,
      }, scanAbortRef.current.signal);
    } else {
      const files = [];
      for (const folder of source.folders) {
        files.push(...(folder.mode === 'filelist'
          ? folder.fileEntries
          : await readFolderFiles(folder.handle, folder.id)));
      }
      if (!mountedRef.current) throw new DOMException('Scan cancelled', 'AbortError');
      sourceFilesRef.current = new Map(files.map((file) => [file.id, file]));
      result = await scanWithWorker(files, source.fileTypes);
    }
    if (!mountedRef.current) return;
    setDuplicates(initializeGroups(result.duplicates || []));
    setTotalFiles(result.totalFiles || 0);
    setScanSource(source);
    setProgress({ value: 100, message: 'Scan complete.' });
    setPhase('results');
  }

  async function startScan() {
    if (busyRef.current || fileTypes.length === 0) return;
    const selectedTypes = fileTypes.includes('all') ? ['all'] : [...fileTypes];
    const source = api.available && serverRoots.length
      ? { mode: 'server', roots: [...serverRoots], base: api.base, fileTypes: selectedTypes }
      : { mode: 'browser', folders: [...folders], fileTypes: selectedTypes };
    if (source.mode === 'browser' && !source.folders.length) return;
    busyRef.current = true;
    setError('');
    setNotice('');
    // Previous results become invalid as soon as a new scan starts.
    setScanSource(null);
    setDuplicates([]);
    try {
      await runScan(source);
    } catch (error) {
      if (mountedRef.current && error.name !== 'AbortError') {
        setError(error.message || 'Scan failed. Please try again.');
        setPhase('idle');
      }
    } finally {
      busyRef.current = false;
    }
  }

  const scanOnly = scanSource?.mode === 'browser' && scanSource.folders.some((folder) => folder.mode === 'filelist');
  const deleteAllowed = Boolean(scanSource && (scanSource.mode === 'server'
    ? api.available
    : pickerSupported && !scanOnly && scanSource.folders.some((folder) => folder.handle)));

  function chooseCopy(groupId, selectedIndex) {
    setDuplicates((previous) => previous.map((group) => group.id === groupId ? { ...group, selectedIndex } : group));
  }

  function chooseAll(type) {
    setDuplicates((previous) => previous.map((group) => ({ ...group, selectedIndex: pickKeepIndex(group.files, type) })));
  }

  async function removeCopies() {
    if (busyRef.current || !deleteAllowed) return;
    const toRemove = copiesToRemove(duplicates);
    if (!toRemove.length) return;
    const serverMode = scanSource.mode === 'server';
    const confirmed = window.confirm(serverMode
      ? `Send ${toRemove.length} file(s) to the Recycle Bin?\n\nThe selected copy in each group will be kept.`
      : `Permanently delete ${toRemove.length} duplicate file(s) from disk?\n\nThe selected copy in each group will be kept. This cannot be undone from the browser.`);
    if (!confirmed) return;

    busyRef.current = true;
    setError('');
    setNotice('');
    const source = scanSource;
    let deleted = 0;
    let failed = false;
    let attempted = false;
    try {
      if (!serverMode) {
        for (const folder of source.folders) {
          if (!folder.handle) continue;
          const permission = await folder.handle.queryPermission({ mode: 'readwrite' });
          if (permission !== 'granted' && await folder.handle.requestPermission({ mode: 'readwrite' }) !== 'granted') {
            throw new Error('Write permission is required to delete files. Grant access or re-select the folder.');
          }
        }
      }
      setPhase('deleting');
      setProgress({ value: 0, message: serverMode ? 'Sending to Recycle Bin…' : 'Removing duplicates…' });
      attempted = true;
      if (serverMode) {
        const result = await requestJson(source.base, '/api/move', { paths: toRemove.map((file) => file.path) });
        deleted = result.moved?.length || 0;
        if (result.errors?.length) {
          failed = true;
          setError(`${result.errors.length} file(s) could not be moved. ${result.errors[0].error}`);
        }
      } else {
        for (const file of toRemove) {
          const original = sourceFilesRef.current.get(file.id);
          if (!original?.parentHandle) throw new Error(`Missing directory handle for ${file.path}`);
          await original.parentHandle.removeEntry(original.fileName, { recursive: false });
          deleted += 1;
          setProgress({ value: Math.round(deleted / toRemove.length * 100), message: `Deleting ${deleted}/${toRemove.length}…` });
        }
      }
      setNotice(serverMode
        ? `Moved ${deleted} file(s) to the system Recycle Bin. Restore them using your system's trash.`
        : `Removed ${deleted} duplicate file(s).`);
    } catch (error) {
      failed = true;
      setError(`Deletion failed: ${error.message}${deleted ? ` (${deleted} file(s) already removed.)` : ''}`);
    } finally {
      // Refresh even after a partial failure; never present stale copies as deletable.
      if (attempted && mountedRef.current) {
        setScanSource(null);
        setDuplicates([]);
        try {
          await runScan(source);
        } catch (error) {
          if (mountedRef.current) {
            setError((previous) => `${previous ? `${previous} ` : ''}Rescan failed: ${error.message}`);
            setPhase('idle');
          }
        }
      } else if (mountedRef.current) {
        setPhase('results');
      }
      busyRef.current = false;
      if (failed && deleted && mountedRef.current) setNotice(`Removed ${deleted} file(s) before the error.`);
    }
  }

  const busy = ['selecting', 'scanning', 'deleting'].includes(phase);
  return {
    folders, serverRoots, fileTypes, api, duplicates, totalFiles, scanSource, scanOnly,
    phase, progress, error, notice, busy, pickerSupported, deleteAllowed,
    canScan: !busy && fileTypes.length > 0 && (folders.length > 0 || (api.available && serverRoots.length > 0)),
    connectApi, selectFolder, addFallbackFolder, addServerPath, toggleFileType, startScan, chooseCopy, chooseAll, removeCopies,
    removeFolder: (id) => setFolders((previous) => previous.filter((folder) => folder.id !== id)),
    removeServerPath: (path) => setServerRoots((previous) => previous.filter((root) => root !== path)),
  };
}
