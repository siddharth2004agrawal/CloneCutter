import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { discoverApi, pickFolder, requestJson } from '../src/lib/api.js';

afterEach(() => {
  mock.restoreAll();
  delete globalThis.window;
});

test('network failures give an actionable message without retrying the request', async () => {
  const fetch = mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(requestJson('', '/api/folders/pick', {}), /unavailable.*Reopen the app/);
  assert.equal(fetch.mock.callCount(), 1);
});

test('aborted requests keep their cancellation error', async () => {
  const controller = new AbortController();
  controller.abort();
  mock.method(globalThis, 'fetch', async () => { throw controller.signal.reason; });
  await assert.rejects(requestJson('', '/api/folders/pick', {}, controller.signal), { name: 'AbortError' });
});

test('unavailable or unexpected responses give a message without implementation details', async () => {
  const fetch = mock.method(globalThis, 'fetch', async () => new Response('', { status: 502 }));
  await assert.rejects(requestJson('', '/api/clonecutter-health'), /could not complete.*Reopen the app/);
  fetch.mock.mockImplementation(async () => new Response('<html>Page not found</html>', { status: 404 }));
  await assert.rejects(requestJson('', '/api/folders/pick', {}), /Something went wrong.*Reopen CloneCutter/);
});

test('server errors preserve their useful error message', async () => {
  mock.method(globalThis, 'fetch', async () => Response.json({ error: 'The folder picker is already open.' }, { status: 400 }));
  await assert.rejects(requestJson('', '/api/folders/pick', {}), /already open/);
});

test('API discovery can reconnect through the page proxy and detects native picker support', async () => {
  globalThis.window = { __CLONECUTTER_API__: 'http://unavailable.example' };
  const fetch = mock.method(globalThis, 'fetch', async (url) => {
    if (url.startsWith('http:')) throw new TypeError('Failed to fetch');
    return Response.json({ ok: true, filesystemScan: true, nativeFolderPicker: true });
  });
  const api = await discoverApi(new AbortController().signal);
  assert.equal(api.available, true);
  assert.equal(api.base, '');
  assert.equal(api.nativeFolderPicker, true);
  assert.equal(fetch.mock.callCount(), 2);
});

test('native folder selection starts once and polls until the dialog finishes', async () => {
  let polls = 0;
  const fetch = mock.method(globalThis, 'fetch', async (_url, options) => {
    if (options.method === 'POST') return Response.json({ pickerId: 'picker-1' }, { status: 202 });
    polls += 1;
    return Response.json(polls === 1 ? { status: 'picking' } : { status: 'complete', path: '/photos & documents' });
  });
  assert.equal((await pickFolder('', {})).path, '/photos & documents');
  assert.equal(fetch.mock.calls.filter((call) => call.arguments[1].method === 'POST').length, 1);
  assert.equal(polls, 2);
});

test('cancelling the native dialog returns without adding a path', async () => {
  mock.method(globalThis, 'fetch', async (_url, options) => Response.json(options.method === 'POST'
    ? { pickerId: 'picker-1' } : { status: 'cancelled', path: null }));
  assert.equal((await pickFolder('', {})).path, null);
});

test('native dialog errors are displayed with the server explanation', async () => {
  mock.method(globalThis, 'fetch', async (_url, options) => Response.json(options.method === 'POST'
    ? { pickerId: 'picker-1' } : { status: 'error', error: 'Open CloneCutter from your desktop session.' }));
  await assert.rejects(pickFolder('', {}), /desktop session/);
});

test('leaving the page stops polling without opening another dialog', async () => {
  const controller = new AbortController();
  const fetch = mock.method(globalThis, 'fetch', async (_url, options) => {
    if (options.method === 'POST') return Response.json({ pickerId: 'picker-1' });
    controller.abort();
    return Response.json({ status: 'picking' });
  });
  await assert.rejects(pickFolder('', {}, controller.signal), { name: 'AbortError' });
  assert.equal(fetch.mock.callCount(), 2);
});
