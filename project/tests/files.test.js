import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeGroups, copiesToRemove } from '../src/lib/files.js';

const files = [
  { path: '/one', lastModified: 200, size: 10 },
  { path: '/two', lastModified: 100, size: 10 },
  { path: '/three', lastModified: 300, size: 10 },
];

test('results retain the oldest copy and start with nothing selected to delete', () => {
  const groups = initializeGroups([{ id: '1', files }]);
  assert.equal(groups[0].selectedIndex, 1);
  assert.deepEqual(copiesToRemove(groups), []);
});

test('deletion includes only checked copies and always excludes the retained copy', () => {
  const group = { id: '1', files, selectedIndex: 1, deleteIndices: [0] };
  assert.deepEqual(copiesToRemove([group]), [files[0]]);
  assert.deepEqual(copiesToRemove([{ ...group, deleteIndices: [0, 1, 2] }]), [files[0], files[2]]);
});

test('selection can be cleared and can leave an entire group untouched', () => {
  const groups = [
    { id: '1', files, selectedIndex: 0, deleteIndices: [] },
    { id: '2', files, selectedIndex: 0, deleteIndices: [2] },
  ];
  assert.deepEqual(copiesToRemove(groups), [files[2]]);
  assert.deepEqual(copiesToRemove(groups.map((group) => ({ ...group, deleteIndices: [] }))), []);
});
