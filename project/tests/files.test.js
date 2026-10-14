import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeGroups, copiesToRemove, removeMovedFiles, selectGroupCopies, setCopyDelete } from '../src/lib/files.js';
import { formatDuration, formatRemainingTime } from '../src/lib/scanTime.js';

const files = [
  { path: '/one', lastModified: 200, size: 10 },
  { path: '/two', lastModified: 100, size: 10 },
  { path: '/three', lastModified: 300, size: 10 },
];

test('scan timing distinguishes unknown, short, long, and completed estimates', () => {
  for (const value of [null, undefined, NaN, Infinity]) {
    assert.equal(formatRemainingTime(value), 'Calculating…');
  }
  assert.equal(formatRemainingTime(0), 'Finishing scan…');
  assert.equal(formatRemainingTime(59), 'Less than a minute');
  assert.equal(formatRemainingTime(61), 'About 2m');
  assert.equal(formatRemainingTime(3661), 'About 1h 2m');
  assert.equal(formatDuration(undefined), '0s');
  assert.equal(formatDuration(65.8), '1m 5s');
  assert.equal(formatDuration(3665), '1h 1m');
});

test('scan results start with every deletion checkbox unchecked', () => {
  const groups = initializeGroups([{ id: '1', files }]);
  assert.deepEqual(groups[0].deleteIndices, []);
  assert.deepEqual(copiesToRemove(groups), []);
});

test('deletion includes only checked files and users can select the oldest copy', () => {
  const group = { id: '1', files, deleteIndices: [0] };
  assert.deepEqual(copiesToRemove([group]), [files[0]]);
  const oldestSelected = setCopyDelete(initializeGroups([{ id: '1', files }])[0], 1, true);
  assert.deepEqual(copiesToRemove([oldestSelected]), [files[1]]);
  assert.deepEqual(copiesToRemove([{ ...group, deleteIndices: [0, 1, 2] }]), []);
});

test('selection can be cleared and can leave an entire group untouched', () => {
  const groups = [
    { id: '1', files, deleteIndices: [] },
    { id: '2', files, deleteIndices: [2] },
  ];
  assert.deepEqual(copiesToRemove(groups), [files[2]]);
  assert.deepEqual(copiesToRemove(groups.map((group) => ({ ...group, deleteIndices: [] }))), []);
});

test('Select all selects every extra copy and leaves the oldest copy unselected', () => {
  const group = selectGroupCopies(initializeGroups([{ id: '1', files }])[0], true);
  assert.deepEqual(group.deleteIndices, [0, 2]);
  assert.deepEqual(copiesToRemove([group]), [files[0], files[2]]);
});

test('Select all preserves user selections and retains an unselected copy', () => {
  let group = initializeGroups([{ id: '1', files }])[0];
  group = setCopyDelete(group, 1, true);
  group = selectGroupCopies(group, true);
  assert.deepEqual(copiesToRemove([group]), [files[1], files[2]]);
  assert.deepEqual(selectGroupCopies(group, true).deleteIndices, group.deleteIndices);
});

test('individual selection preserves a copy and permits changing which file remains', () => {
  let group = initializeGroups([{ id: '1', files }])[0];
  group = setCopyDelete(group, 0, true);
  group = setCopyDelete(group, 1, true);
  assert.strictEqual(setCopyDelete(group, 2, true), group);
  group = setCopyDelete(group, 0, false);
  group = setCopyDelete(group, 2, true);
  assert.deepEqual(copiesToRemove([group]), [files[1], files[2]]);
});

test('unchecking a file or Select all clears the corresponding deletion selections', () => {
  const group = initializeGroups([{ id: '1', files }])[0];
  const selected = selectGroupCopies(group, true);
  assert.deepEqual(copiesToRemove([setCopyDelete(selected, 0, false)]), [files[2]]);
  const cleared = selectGroupCopies(selected, false);
  assert.deepEqual(copiesToRemove([cleared]), []);
});

test('Select all applies to all groups including results beyond the first page', () => {
  const groups = initializeGroups(Array.from({ length: 30 }, (_, index) => ({ id: String(index), files:
    files.map((file) => ({ ...file, path: `/group-${index}${file.path}` })) })));
  const selected = groups.map((group) => selectGroupCopies(group, true));
  assert.equal(copiesToRemove(selected).length, 60);
  assert.ok(selected.every((group) => group.deleteIndices.length === group.files.length - 1));
  assert.deepEqual(copiesToRemove(selected.map((group) => selectGroupCopies(group, false))), []);
});

test('successful deletion removes only moved files and clears deletion selections', () => {
  const group = { id: '1', files, deleteIndices: [0] };
  const updated = removeMovedFiles(group, new Set([files[0].path]));
  assert.deepEqual(updated.files, [files[1], files[2]]);
  assert.deepEqual(copiesToRemove([updated]), []);
  assert.deepEqual(copiesToRemove([selectGroupCopies(updated, true)]), [files[2]]);
});

test('partial deletion retains failed files and still preserves a copy on retry', () => {
  const group = { id: '1', files, deleteIndices: [0, 1] };
  const updated = removeMovedFiles(group, new Set([files[0].path]));
  assert.deepEqual(updated.files, [files[1], files[2]]);
  assert.deepEqual(copiesToRemove([selectGroupCopies(updated, true)]), [files[2]]);
  const retry = setCopyDelete(updated, 0, true);
  assert.deepEqual(copiesToRemove([retry]), [files[1]]);
  assert.strictEqual(setCopyDelete(retry, 1, true), retry);
});
