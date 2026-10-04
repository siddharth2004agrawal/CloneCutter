import io
import json
import os
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

import server


class FilesystemTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        server.LAST_SCAN_ID = None
        server.LAST_SCAN_GROUPS = []
        server.LAST_SCAN_PATHS.clear()

    def tearDown(self):
        self.temp.cleanup()

    def file(self, name, content=b'copied contents'):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return path

    def scan(self, types=None):
        return server.scan_duplicates([str(self.root)], types or ['all'])

    def prepare(self):
        self.original = self.file('original.txt')
        self.copy = self.file('nested/copy.txt')
        self.other_copy = self.file('another.txt')
        groups, _ = self.scan()
        server.LAST_SCAN_GROUPS = groups
        server.LAST_SCAN_ID = 'test-scan'
        server.LAST_SCAN_PATHS.update(file['path'] for group in groups for file in group['files'])
        self.trash = self.root / '.Trash'
        self.trash.mkdir()

    def move(self, paths):
        def fake_trash(path):
            Path(path).rename(self.trash / Path(path).name)
        with patch.object(server, 'HAS_SEND2TRASH', True), patch.object(server, 'send2trash', fake_trash):
            return server.recycle_paths([str(p) for p in paths], 'test-scan')

    def test_content_duplicates_across_directories_and_names(self):
        self.file('one.txt')
        self.file('deep/different-name.bin')
        self.file('unique.txt', b'unique')
        groups, total = self.scan()
        self.assertEqual(total, 3)
        self.assertEqual(len(groups), 1)
        self.assertEqual(len(groups[0]['files']), 2)

    def test_same_size_and_sample_do_not_imply_identical_contents(self):
        prefix = b'a' * (256 * 1024)
        self.file('one', prefix + b'1')
        self.file('two', prefix + b'2')
        self.assertEqual(self.scan()[0], [])

    def test_symlinks_hardlinks_devices_and_trash_are_excluded(self):
        original = self.file('one.txt')
        os.link(original, self.root / 'hardlink.txt')
        (self.root / 'symlink.txt').symlink_to(original)
        (self.root / 'loop').symlink_to(self.root, target_is_directory=True)
        os.mkfifo(self.root / 'pipe')
        for name in ['.Trash', '.Trash-1000', '.Trashes', '$RECYCLE.BIN']:
            self.file(f'{name}/copy.txt')
        groups, total = self.scan()
        self.assertEqual(total, 1)
        self.assertEqual(groups, [])
        self.assertTrue(server.excluded_directory(str(Path.home() / '.local/share/Trash')))
        self.assertTrue(server.excluded_directory('/proc'))

    def test_type_filters_and_empty_files(self):
        self.file('one.txt', b'')
        self.file('two.txt', b'')
        self.file('picture.png', b'')
        groups, total = self.scan(['document'])
        self.assertEqual(total, 2)
        self.assertEqual(len(groups[0]['files']), 2)

    def test_inaccessible_files_are_skipped(self):
        self.file('one')
        self.file('two')
        real_hash = server.hash_path
        def inaccessible(path, *args, **kwargs):
            if path.endswith('two'):
                raise PermissionError('Unreadable')
            return real_hash(path, *args, **kwargs)
        summary = {}
        with patch.object(server, 'hash_path', inaccessible):
            groups, total = server.scan_duplicates([str(self.root)], ['all'], summary=summary)
        self.assertEqual(groups, [])
        self.assertEqual(total, 2)
        self.assertGreater(summary['skipped'], 0)

    def test_cancelled_scan_stops(self):
        event = threading.Event()
        event.set()
        with self.assertRaises(server.ScanCancelled):
            server.scan_duplicates([str(self.root)], ['all'], cancel=event)

    def test_delete_one_checked_copy_leaves_unselected_files(self):
        self.prepare()
        result = self.move([self.copy])
        self.assertEqual(result['moved'], [str(self.copy)])
        self.assertEqual(result['errors'], [])
        self.assertTrue(self.original.exists())
        self.assertTrue(self.other_copy.exists())
        self.assertFalse(self.copy.exists())
        self.assertTrue((self.trash / self.copy.name).exists())

    def test_select_all_extras_keeps_one_copy(self):
        self.prepare()
        result = self.move([self.copy, self.other_copy])
        self.assertEqual(len(result['moved']), 2)
        self.assertTrue(self.original.exists())
        self.assertEqual(self.scan()[0], [])

    def test_deleting_every_copy_is_refused(self):
        self.prepare()
        result = self.move([self.original, self.copy, self.other_copy])
        self.assertEqual(result['moved'], [])
        self.assertEqual(len(result['errors']), 3)
        self.assertTrue(self.original.exists())

    def test_changed_file_is_not_deleted(self):
        self.prepare()
        self.copy.write_bytes(b'new contents')
        result = self.move([self.copy])
        self.assertEqual(result['moved'], [])
        self.assertTrue(self.copy.exists())

    def test_missing_or_changed_keeper_prevents_deletion(self):
        for change in ['missing', 'changed']:
            with self.subTest(change=change):
                self.prepare()
                if change == 'missing':
                    self.original.unlink()
                else:
                    self.original.write_bytes(b'changed keeper')
                result = self.move([self.copy, self.other_copy])
                self.assertEqual(result['moved'], [])
                self.assertTrue(self.copy.exists())
                self.trash.rmdir()

    def test_symlink_replacement_is_not_deleted(self):
        self.prepare()
        self.copy.unlink()
        self.copy.symlink_to(self.original)
        result = self.move([self.copy])
        self.assertEqual(result['moved'], [])
        self.assertTrue(self.copy.is_symlink())
        self.assertTrue(self.original.exists())

    def test_stale_scan_and_nonduplicate_paths_are_refused(self):
        self.prepare()
        with self.assertRaises(ValueError):
            server.recycle_paths([str(self.copy)], 'older-scan')
        unique = self.file('unique', b'unique')
        result = self.move([unique])
        self.assertEqual(result['moved'], [])
        self.assertEqual(len(result['errors']), 1)
        self.assertTrue(unique.exists())

    def test_partial_trash_failure_is_reported(self):
        self.prepare()
        def partial(path):
            if path == str(self.copy):
                raise PermissionError('No trash access')
            Path(path).rename(self.trash / Path(path).name)
        with patch.object(server, 'HAS_SEND2TRASH', True), patch.object(server, 'send2trash', side_effect=partial):
            result = server.recycle_paths([str(self.copy), str(self.other_copy)], 'test-scan')
        self.assertEqual(result['moved'], [str(self.other_copy)])
        self.assertIn('No trash access', result['errors'][0]['error'])
        self.assertTrue(self.copy.exists())
        self.assertTrue(self.original.exists())

    def request(self, method, path, data=None):
        """Exercise HTTP routing without binding a port or scanning host files."""
        handler = server.Handler.__new__(server.Handler)
        handler.path = path
        body = json.dumps(data or {}).encode()
        handler.headers = {'Content-Length': str(len(body))}
        handler.rfile, handler.wfile = io.BytesIO(body), io.BytesIO()
        codes = []
        handler.send_response = codes.append
        handler.send_header = lambda *args: None
        handler.end_headers = lambda: None
        getattr(handler, f'do_{method}')()
        return codes[0], json.loads(handler.wfile.getvalue())

    def test_filesystem_api_discovers_roots_and_polls_results(self):
        self.file('one')
        self.file('nested/two')
        with patch.object(server, 'filesystem_roots', return_value=[str(self.root)]):
            code, started = self.request('POST', '/api/scan', {'scope': 'filesystem', 'file_types': ['all']})
        self.assertEqual(code, 202)
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            code, result = self.request('GET', f"/api/scan?id={started['scanId']}")
            if result['status'] != 'scanning':
                break
            time.sleep(.01)
        self.assertEqual(result['status'], 'complete')
        self.assertEqual(result['totalFiles'], 2)
        self.assertEqual(len(result['duplicates']), 1)
        self.assertNotIn('signature', result['duplicates'][0]['files'][0])
        self.assertEqual(server.LAST_SCAN_ID, started['scanId'])
        self.assertEqual(self.request('GET', '/api/scan?id=stale')[0], 404)

    def test_api_rejects_empty_types_and_health_exposes_trash_support(self):
        code, _ = self.request('POST', '/api/scan', {'file_types': []})
        self.assertEqual(code, 400)
        with patch.object(server, 'HAS_SEND2TRASH', False):
            _, health = self.request('GET', '/api/clonecutter-health')
        self.assertTrue(health['filesystemScan'])
        self.assertFalse(health['canTrash'])

    def test_running_job_can_be_cancelled_and_rejects_concurrent_scan(self):
        started = threading.Event()
        def slow_scan(*args):
            started.set()
            cancel = args[3]
            cancel.wait(2)
            server.check_cancel(cancel)
            raise AssertionError('Expected cancellation')
        with patch.object(server, 'scan_duplicates', slow_scan):
            scan_id = server.start_scan([str(self.root)], ['all'])
            self.assertTrue(started.wait(2))
            with self.assertRaises(ValueError):
                server.start_scan([str(self.root)], ['all'])
            self.assertIsNone(server.LAST_SCAN_ID)
            self.assertEqual(self.request('POST', '/api/scan/cancel', {'scanId': scan_id})[0], 200)
            deadline = time.monotonic() + 2
            while time.monotonic() < deadline and server.OPERATION_LOCK.locked():
                time.sleep(.01)
            self.assertFalse(server.OPERATION_LOCK.locked())
            self.assertEqual(self.request('GET', f'/api/scan?id={scan_id}')[1]['status'], 'cancelled')


if __name__ == '__main__':
    unittest.main()
