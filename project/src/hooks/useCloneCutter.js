import { useEffect, useRef, useState } from 'react';
import { discoverApi, requestJson } from '../lib/api.js';
import { copiesToRemove, formatBytes, initializeGroups, pickKeepIndex } from '../lib/files.js';

function pause(signal) {
  return new Promise((resolve, reject) => {
    const aborted = () => {
      clearTimeout(timer);
      reject(new DOMException('Scan cancelled', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', aborted);
      resolve();
    }, 500);
    if (signal.aborted) aborted();
    else signal.addEventListener('abort', aborted, { once: true });
  });
}

export default function useCloneCutter() {
  const [fileTypes, setFileTypes] = useState(['image', 'video', 'audio', 'document', 'archive', 'all']);
  const [api, setApi] = useState({ available: false, base: '', checking: true, canTrash: false });
  const [duplicates, setDuplicates] = useState([]);
  const [totalFiles, setTotalFiles] = useState(0);
  const [scanSource, setScanSource] = useState(null);
  const [phase, setPhase] = useState('idle');
  const [progress, setProgress] = useState({ value: 0, message: 'Ready to scan…' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cleared, setCleared] = useState({ bytes: 0, files: 0 });
  const [cancelling, setCancelling] = useState(false);
  const busyRef = useRef(false);
  const apiProbeRef = useRef(null);
  const scanAbortRef = useRef(null);
  const activeScanRef = useRef(null);
  const mountedRef = useRef(true);

  async function connectApi() {
    apiProbeRef.current?.abort();
    const controller = new AbortController();
    apiProbeRef.current = controller;
    setApi((previous) => ({ ...previous, checking: true }));
    try {
      const found = await discoverApi(controller.signal);
      if (!controller.signal.aborted) setApi({ ...found, checking: false });
    } catch {
      if (!controller.signal.aborted) setApi({ available: false, base: '', checking: false, canTrash: false });
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    void connectApi();
    return () => {
      mountedRef.current = false;
      apiProbeRef.current?.abort();
      scanAbortRef.current?.abort();
      const active = activeScanRef.current;
      if (active) void requestJson(active.base, '/api/scan/cancel', { scanId: active.id }).catch(() => {});
    };
  }, []);

  function toggleFileType(type, checked) {
    if (type === 'all') {
      setFileTypes(checked ? ['image', 'video', 'audio', 'document', 'archive', 'all'] : []);
    } else {
      setFileTypes((previous) => checked
        ? [...new Set([...previous, type])]
        : previous.filter((value) => value !== type && value !== 'all'));
    }
  }

  async function startScan() {
    if (busyRef.current || !api.available || !fileTypes.length) return;
    busyRef.current = true;
    setError('');
    setNotice('');
    setScanSource(null);
    setDuplicates([]);
    setTotalFiles(0);
    setCancelling(false);
    setPhase('scanning');
    setProgress({ value: 0, message: 'Preparing a whole-filesystem scan…' });
    const controller = new AbortController();
    scanAbortRef.current = controller;
    let active;
    try {
      const started = await requestJson(api.base, '/api/scan', {
        scope: 'filesystem', file_types: fileTypes.includes('all') ? ['all'] : [...fileTypes],
      }, controller.signal);
      active = { id: started.scanId, base: api.base };
      activeScanRef.current = active;
      while (!controller.signal.aborted) {
        const result = await requestJson(active.base, `/api/scan?id=${encodeURIComponent(active.id)}`, undefined, controller.signal);
        if (!mountedRef.current) return;
        if (result.progress) setProgress(result.progress);
        if (result.status === 'cancelled') {
          setNotice('Scan cancelled. Start a new scan when you are ready.');
          setPhase('idle');
          return;
        }
        if (result.status === 'error') throw new Error(result.error || 'Scan failed.');
        if (result.status === 'complete') {
          setDuplicates(initializeGroups(result.duplicates || []));
          setTotalFiles(result.totalFiles || 0);
          setScanSource({ mode: 'server', base: active.base, scanId: active.id, roots: result.roots, skipped: result.skipped || 0 });
          setPhase('results');
          return;
        }
        await pause(controller.signal);
      }
    } catch (error) {
      if (active) void requestJson(active.base, '/api/scan/cancel', { scanId: active.id }).catch(() => {});
      if (mountedRef.current && error.name !== 'AbortError') {
        setError(error.message || 'Scan failed. Please try again.');
        setPhase('idle');
      }
    } finally {
      activeScanRef.current = null;
      busyRef.current = false;
      if (mountedRef.current) setCancelling(false);
    }
  }

  async function cancelScan() {
    const active = activeScanRef.current;
    if (!active || cancelling) return;
    setCancelling(true);
    try {
      await requestJson(active.base, '/api/scan/cancel', { scanId: active.id });
    } catch (error) {
      setError(`Could not cancel scan: ${error.message}`);
      setCancelling(false);
    }
  }

  function chooseCopy(groupId, selectedIndex) {
    setDuplicates((previous) => previous.map((group) => group.id === groupId
      ? { ...group, selectedIndex, deleteIndices: group.deleteIndices.filter((index) => index !== selectedIndex) }
      : group));
  }

  function chooseAll(type) {
    setDuplicates((previous) => previous.map((group) => {
      const selectedIndex = pickKeepIndex(group.files, type);
      return { ...group, selectedIndex, deleteIndices: group.deleteIndices.filter((index) => index !== selectedIndex) };
    }));
  }

  function toggleCopy(groupId, index, checked) {
    setDuplicates((previous) => previous.map((group) => group.id === groupId && index !== group.selectedIndex
      ? { ...group, deleteIndices: checked ? [...new Set([...group.deleteIndices, index])] : group.deleteIndices.filter((value) => value !== index) }
      : group));
  }

  function selectCopies(checked) {
    setDuplicates((previous) => previous.map((group) => ({ ...group,
      deleteIndices: checked ? group.files.map((_, index) => index).filter((index) => index !== group.selectedIndex) : [],
    })));
  }

  const deleteAllowed = Boolean(scanSource && api.available && api.canTrash);
  const selectedFiles = copiesToRemove(duplicates);

  async function removeCopies() {
    if (busyRef.current || !deleteAllowed || !selectedFiles.length) return;
    if (!window.confirm(`Move ${selectedFiles.length} selected duplicate file(s) to Trash / Recycle Bin?\n\nAt least one identical copy in each group will be kept.`)) return;
    busyRef.current = true;
    setPhase('deleting');
    setProgress({ value: 0, message: 'Verifying copies and moving selected files to Trash…' });
    setError('');
    setNotice('');
    try {
      const result = await requestJson(scanSource.base, '/api/move', {
        scanId: scanSource.scanId, paths: selectedFiles.map((file) => file.path),
      });
      if (!mountedRef.current) return;
      const moved = new Set(result.moved || []);
      const movedBytes = selectedFiles.reduce((sum, file) => sum + (moved.has(file.path) ? file.size : 0), 0);
      setCleared((previous) => ({ bytes: previous.bytes + movedBytes, files: previous.files + moved.size }));
      setDuplicates((previous) => previous.map((group) => {
        const keeper = group.files[group.selectedIndex].path;
        const files = group.files.filter((file) => !moved.has(file.path));
        return { ...group, files, selectedIndex: files.findIndex((file) => file.path === keeper), deleteIndices: [] };
      }).filter((group) => group.files.length > 1));
      setNotice(`Moved ${moved.size} file(s) (${formatBytes(movedBytes)}) to Trash / Recycle Bin. You can restore them from your system's trash.`);
      if (result.errors?.length) setError(`${result.errors.length} file(s) could not be deleted. ${result.errors[0].error}`);
    } catch (error) {
      if (mountedRef.current) {
        // The response may have been lost after files were moved. Require fresh results.
        setScanSource(null);
        setDuplicates([]);
        setError(`Deletion failed: ${error.message} Scan again to refresh the file list.`);
      }
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setPhase('results');
    }
  }

  const busy = phase === 'scanning' || phase === 'deleting';
  return {
    fileTypes, api, duplicates, totalFiles, scanSource, phase, progress, error, notice, cleared, busy,
    deleteAllowed, selectedCount: selectedFiles.length, selectedBytes: selectedFiles.reduce((sum, file) => sum + file.size, 0),
    canScan: !busy && api.available && fileTypes.length > 0,
    cancelling, connectApi, toggleFileType, startScan, cancelScan, chooseCopy, chooseAll, toggleCopy, selectCopies, removeCopies,
  };
}
