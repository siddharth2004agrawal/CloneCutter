export async function requestJson(base, path, body, signal) {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    ...(body === undefined ? {} : {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    signal,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || response.statusText || 'Request failed');
  return data;
}

export async function discoverApi(signal) {
  const configured = window.__CLONECUTTER_API__ || import.meta.env.VITE_CLONECUTTER_API || '';
  const candidates = [...new Set([configured, '', ...(!configured ? ['http://127.0.0.1:8765'] : [])])];
  for (const base of candidates) {
    try {
      const timeout = AbortSignal.timeout(2500);
      const data = await requestJson(base, '/api/clonecutter-health', undefined, AbortSignal.any([signal, timeout]));
      if (data.ok === true) return { available: true, base };
    } catch (error) {
      if (signal.aborted) throw error;
    }
  }
  return { available: false, base: configured };
}
