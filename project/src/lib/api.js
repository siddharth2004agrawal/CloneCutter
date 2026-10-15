export async function requestJson(base, path, body, signal) {
  let response;
  try {
    response = await fetch(`${base}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      signal,
    });
  } catch (error) {
    if (signal?.aborted || error.name === 'AbortError') throw error;
    throw new Error('Cannot reach the CloneCutter local server. Run npm run dev in the project folder, then reload this page.', { cause: error });
  }
  if (response.status === 502 || response.status === 503 || response.status === 504) {
    throw new Error('The CloneCutter local server is unavailable. Restart npm run dev in the project folder, then reload this page.');
  }
  let data;
  try {
    data = await response.json();
  } catch (error) {
    if (signal?.aborted || error.name === 'AbortError') throw error;
    throw new Error('The local server returned an unexpected response. Restart npm run dev in the project folder, then reload this page.', { cause: error });
  }
  if (!response.ok) throw new Error(data.error || response.statusText || 'Request failed');
  return data;
}

export async function discoverApi(signal) {
  const configured = window.__CLONECUTTER_API__ || import.meta.env?.VITE_CLONECUTTER_API || '';
  const candidates = [...new Set([configured, '', ...(!configured ? ['http://127.0.0.1:8765'] : [])])];
  for (const base of candidates) {
    try {
      const timeout = AbortSignal.timeout(2500);
      const data = await requestJson(base, '/api/clonecutter-health', undefined, AbortSignal.any([signal, timeout]));
      if (data.ok === true && data.filesystemScan === true) return {
        available: true, base, canTrash: data.canTrash === true,
        nativeFolderPicker: data.nativeFolderPicker === true,
        trashName: ['Trash', 'Recycle Bin'].includes(data.trashName) ? data.trashName : 'Trash / Recycle Bin',
      };
    } catch (error) {
      if (signal.aborted) throw error;
    }
  }
  return { available: false, base: configured, canTrash: false };
}

export async function pickFolder(base, body, signal) {
  const started = await requestJson(base, '/api/folders/pick', body, signal);
  if (!started.pickerId) throw new Error('Restart npm run dev to load native folder selection, then reload this page.');
  for (;;) {
    const selection = await requestJson(base, `/api/folders/pick?id=${encodeURIComponent(started.pickerId)}`, undefined, signal);
    if (selection.status === 'complete' || selection.status === 'cancelled') return selection;
    if (selection.status === 'error') throw new Error(selection.error || 'Could not open the native folder picker.');
    if (selection.status !== 'picking') throw new Error('The folder picker returned an unexpected response. Choose a folder again.');
    await new Promise((resolve, reject) => {
      const aborted = () => {
        clearTimeout(timer);
        reject(signal.reason || new DOMException('Folder selection cancelled', 'AbortError'));
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', aborted);
        resolve();
      }, 400);
      if (signal?.aborted) aborted();
      else signal?.addEventListener('abort', aborted, { once: true });
    });
  }
}
