import io
import json
import os
import subprocess
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
        server.FOLDER_PICKER_STATE.clear()

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

    def test_scan_time_estimate_updates_during_large_files_and_after_sampling(self):
        self.file('one.bin', b'a' * (2 * 1024 * 1024))
        self.file('two.bin', b'a' * (2 * 1024 * 1024))
        self.file('unique.bin', b'b' * (2 * 1024 * 1024))
        clock = [10.0]
        updates = []
        real_walk, real_hash = server.walk_files, server.hash_path
        def slow_discovery(*args, **kwargs):
            for entry in real_walk(*args, **kwargs):
                clock[0] += 2
                yield entry
        def slow_hash(*args, **kwargs):
            observer = kwargs.pop('on_progress')
            def read_chunk(size):
                clock[0] += 1
                observer(size)
            return real_hash(*args, **kwargs, on_progress=read_chunk)
        with patch.object(server.time, 'monotonic', side_effect=lambda: clock[0]), \
                patch.object(server, 'walk_files', side_effect=slow_discovery), \
                patch.object(server, 'hash_path', side_effect=slow_hash):
            groups, total = server.scan_duplicates([str(self.root)], ['all'], progress=updates.append)
        self.assertEqual((len(groups), total), (1, 3))
        discovery = [update for update in updates if update['value'] < 10]
        self.assertTrue(all(update['remainingSeconds'] is None for update in discovery))
        self.assertEqual(discovery[-1]['elapsedSeconds'], 6)
        last_sample = next(update for update in reversed(updates) if update['message'] == 'Checking file samples 3/3')
        full_start = next(update for update in updates if update['message'] == 'Verifying full contents…')
        self.assertEqual(full_start['remainingSeconds'], 16)
        self.assertGreater(last_sample['remainingSeconds'], full_start['remainingSeconds'])
        # Progress and ETA arrive before the first large file finishes hashing.
        self.assertTrue(any(45 < update['value'] < 72 and update['remainingSeconds'] > 0
                            for update in updates if update['message'] == 'Verifying full contents 1/2'))
        self.assertEqual(updates[-1]['value'], 100)
        self.assertEqual(updates[-1]['remainingSeconds'], 0)
        self.assertEqual(updates[-1]['elapsedSeconds'], 13)

    def test_empty_scan_reports_zero_time_remaining(self):
        updates = []
        self.assertEqual(server.scan_duplicates([str(self.root)], ['all'], progress=updates.append), ([], 0))
        self.assertIsNone(updates[0]['remainingSeconds'])
        self.assertEqual(updates[-1]['remainingSeconds'], 0)

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
        self.assertEqual(result['trashName'], server.trash_name())
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

    def test_missing_trash_support_keeps_all_files(self):
        self.prepare()
        with patch.object(server, 'HAS_SEND2TRASH', False), patch.object(server, 'send2trash') as trash:
            with self.assertRaisesRegex(ValueError, 'Install send2trash'):
                server.recycle_paths([str(self.copy)], 'test-scan')
            trash.assert_not_called()
        self.assertTrue(self.original.exists())
        self.assertTrue(self.copy.exists())
        self.assertTrue(self.other_copy.exists())

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

    def wait_for_scan(self, scan_id):
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            _, result = self.request('GET', f'/api/scan?id={scan_id}')
            if result['status'] != 'scanning' and not server.OPERATION_LOCK.locked():
                return result
            time.sleep(.01)
        self.fail('Scan did not finish')

    def test_folder_browser_lists_real_folders_and_files(self):
        self.file('z-last/file')
        self.file('A-first/file')
        self.file('regular-file')
        self.file('.hidden-file', b'')
        self.file('Another.txt', b'hello')
        self.file('.Trash/copy')
        (self.root / 'linked-folder').symlink_to(self.root / 'A-first', target_is_directory=True)
        (self.root / 'linked-file').symlink_to(self.root / 'regular-file')
        os.mkfifo(self.root / 'pipe')
        with patch.object(server.Path, 'home', return_value=self.root):
            code, result = self.request('GET', '/api/folders')
        self.assertEqual(code, 200)
        self.assertEqual(result['path'], str(self.root))
        self.assertEqual(result['parent'], str(self.root.parent))
        self.assertEqual([folder['name'] for folder in result['directories']], ['A-first', 'z-last'])
        self.assertEqual(result['directories'][0]['path'], str(self.root / 'A-first'))
        self.assertEqual([file['name'] for file in result['files']], ['.hidden-file', 'Another.txt', 'regular-file'])
        self.assertEqual(result['files'][1], {'name': 'Another.txt', 'path': str(self.root / 'Another.txt'), 'size': 5})
        self.assertEqual(result['roots'], server.filesystem_roots())

    def test_native_picker_adds_validated_absolute_folder(self):
        folder = self.root / 'photos & documents'
        folder.mkdir()
        response = subprocess.CompletedProcess([], 0, json.dumps({'path': str(folder)}), '')
        with patch.object(server.subprocess, 'run', return_value=response) as run:
            code, started = self.request('POST', '/api/folders/pick', {'initialPath': str(self.root)})
            result = self.wait_for_picker(started['pickerId'])
        self.assertEqual(code, 202)
        self.assertEqual(result['status'], 'complete')
        self.assertEqual(result['path'], str(folder))
        self.assertEqual(run.call_args.args[0], [server.sys.executable, str(server.ROOT / 'scripts' / 'pick_folder.py'), str(self.root)])
        self.assertFalse(server.FOLDER_PICKER_LOCK.locked())

    def wait_for_picker(self, picker_id):
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            code, result = self.request('GET', f'/api/folders/pick?id={picker_id}')
            self.assertEqual(code, 200)
            if result['status'] != 'picking':
                return result
            time.sleep(.01)
        self.fail('Folder picker did not finish')

    def test_native_picker_returns_while_dialog_is_still_open(self):
        dialog_closed = threading.Event()
        def dialog(*_args, **_kwargs):
            dialog_closed.wait(5)
            return subprocess.CompletedProcess([], 0, '{"path": null}', '')
        with patch.object(server.subprocess, 'run', side_effect=dialog):
            try:
                code, started = self.request('POST', '/api/folders/pick', {'initialPath': str(self.root)})
                self.assertEqual(code, 202)
                code, state = self.request('GET', f'/api/folders/pick?id={started["pickerId"]}')
                self.assertEqual((code, state['status']), (200, 'picking'))
                self.assertEqual(self.request('POST', '/api/folders/pick', {'initialPath': str(self.root)})[0], 400)
                self.assertEqual(self.request('GET', '/api/clonecutter-health')[0], 200)
            finally:
                dialog_closed.set()
            self.assertEqual(self.wait_for_picker(started['pickerId'])['status'], 'cancelled')

    def test_native_picker_cancel_does_not_select_a_folder(self):
        response = subprocess.CompletedProcess([], 0, '{"path": null}', '')
        with patch.object(server.subprocess, 'run', return_value=response):
            code, started = self.request('POST', '/api/folders/pick', {'initialPath': str(self.root)})
            result = self.wait_for_picker(started['pickerId'])
        self.assertEqual(code, 202)
        self.assertEqual((result['status'], result['path']), ('cancelled', None))

    def test_native_picker_rejects_invalid_selection_and_reports_failures(self):
        responses = [(0, {'path': 'relative/path'}),
                     (0, {'path': str(self.file('not-a-folder'))}),
                     (1, {'error': 'No desktop session available.'})]
        for returncode, payload in responses:
            with self.subTest(payload=payload):
                response = subprocess.CompletedProcess([], returncode, json.dumps(payload), '')
                with patch.object(server.subprocess, 'run', return_value=response):
                    code, started = self.request('POST', '/api/folders/pick', {'initialPath': str(self.root)})
                    result = self.wait_for_picker(started['pickerId'])
                self.assertEqual(code, 202)
                self.assertEqual(result['status'], 'error')
                self.assertTrue(result['error'])
                self.assertFalse(server.FOLDER_PICKER_LOCK.locked())

    def test_native_picker_rejects_missing_or_outdated_status_requests(self):
        self.assertEqual(self.request('GET', '/api/folders/pick')[0], 404)
        self.assertEqual(self.request('GET', '/api/folders/pick?id=old')[0], 404)

    def test_native_picker_allows_only_one_open_dialog(self):
        server.FOLDER_PICKER_LOCK.acquire()
        try:
            with patch.object(server.subprocess, 'run') as run:
                code, result = self.request('POST', '/api/folders/pick', {'initialPath': str(self.root)})
            self.assertEqual(code, 400)
            self.assertIn('already open', result['error'])
            run.assert_not_called()
        finally:
            server.FOLDER_PICKER_LOCK.release()

    def test_folder_browser_handles_encoded_paths_and_empty_folders(self):
        from urllib.parse import quote
        folder = self.root / 'space & # folder'
        folder.mkdir()
        code, result = self.request('GET', f'/api/folders?path={quote(str(folder), safe="")}')
        self.assertEqual(code, 200)
        self.assertEqual(result['path'], str(folder))
        self.assertEqual(result['directories'], [])
        self.assertEqual(result['files'], [])
        self.assertEqual(result['breadcrumbs'][-1], {'name': folder.name, 'path': str(folder)})
        self.assertEqual(result['breadcrumbs'][-2]['path'], str(self.root))
        self.assertEqual(result['breadcrumbs'][0]['path'], folder.anchor)

    def test_folder_shortcuts_only_offer_accessible_real_folders(self):
        (self.root / 'Documents').mkdir()
        (self.root / 'Downloads').mkdir()
        (self.root / 'Pictures').symlink_to(self.root / 'Documents', target_is_directory=True)
        self.file('Desktop')
        actual_access = server.os.access
        def accessible(path, mode):
            return path != str(self.root / 'Downloads') and actual_access(path, mode)
        with patch.object(server.Path, 'home', return_value=self.root), patch.object(server.os, 'access', side_effect=accessible):
            code, result = self.request('GET', '/api/folders')
        self.assertEqual(code, 200)
        self.assertIn({'name': 'Documents', 'path': str(self.root / 'Documents')}, result['shortcuts'])
        self.assertFalse({'Downloads', 'Pictures', 'Desktop', 'Videos', 'Music'} & {folder['name'] for folder in result['shortcuts']})

    def test_folder_scan_compares_selected_roots_and_excludes_other_files(self):
        self.original = self.file('selected-one/original.txt')
        self.copy = self.file('selected-two/nested/copy.txt')
        outside = self.file('unselected/copy.txt')
        roots = [str(self.root / 'selected-one'), str(self.root / 'selected-two'),
                 str(self.root / 'selected-two/nested'), str(self.root / 'selected-one')]
        code, started = self.request('POST', '/api/scan', {'scope': 'folders', 'roots': roots})
        self.assertEqual(code, 202)
        result = self.wait_for_scan(started['scanId'])
        self.assertEqual(result['status'], 'complete')
        self.assertEqual(result['totalFiles'], 2)
        paths = {file['path'] for group in result['duplicates'] for file in group['files']}
        self.assertEqual(paths, {str(self.original), str(self.copy)})
        self.assertEqual(result['roots'], list(dict.fromkeys(roots)))
        self.trash = self.root / '.Trash'
        self.trash.mkdir()
        def fake_trash(path):
            Path(path).rename(self.trash / Path(path).name)
        with patch.object(server, 'HAS_SEND2TRASH', True), patch.object(server, 'send2trash', fake_trash):
            code, deletion = self.request('POST', '/api/move', {
                'scanId': started['scanId'], 'paths': [str(self.copy), str(outside)],
            })
        self.assertEqual(code, 200)
        self.assertEqual(deletion['moved'], [str(self.copy)])
        self.assertEqual(len(deletion['errors']), 1)
        self.assertTrue(self.original.exists())
        self.assertTrue(outside.exists())

    def test_folder_api_rejects_invalid_roots_and_scopes(self):
        regular = self.file('file.txt')
        self.file('.Trash/file')
        link = self.root / 'linked'
        link.symlink_to(self.root, target_is_directory=True)
        invalid = ['relative/path', str(self.root / 'missing'), str(regular),
                   str(self.root / '.Trash'), str(link), str(link / '.Trash'), '/proc']
        for path in invalid:
            with self.subTest(path=path):
                from urllib.parse import quote
                self.assertEqual(self.request('GET', f'/api/folders?path={quote(path, safe="")}')[0], 400)
                self.assertEqual(self.request('POST', '/api/scan', {'scope': 'folders', 'roots': [path]})[0], 400)
        for data in [{'scope': 'folders'}, {'scope': 'folders', 'roots': []},
                     {'scope': 'folders', 'roots': [str(self.root), 42]}, {'scope': 'unknown'}]:
            with self.subTest(data=data):
                self.assertEqual(self.request('POST', '/api/scan', data)[0], 400)

    def test_folder_api_reports_unreadable_folders(self):
        with patch.object(server.os, 'scandir', side_effect=PermissionError('Unreadable')):
            self.assertEqual(self.request('GET', f'/api/folders?path={self.root}')[0], 403)
            self.assertEqual(self.request('POST', '/api/scan', {'scope': 'folders', 'roots': [str(self.root)]})[0], 403)

    def test_filesystem_api_discovers_roots_and_polls_results(self):
        self.file('one')
        self.file('nested/two')
        with patch.object(server, 'filesystem_roots', return_value=[str(self.root)]):
            code, started = self.request('POST', '/api/scan', {'scope': 'filesystem', 'file_types': ['all']})
        self.assertEqual(code, 202)
        result = self.wait_for_scan(started['scanId'])
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

    def test_health_names_native_trash_using_server_os(self):
        for platform, expected in [('win32', 'Recycle Bin'), ('darwin', 'Trash'), ('linux', 'Trash')]:
            with self.subTest(platform=platform), patch.object(server.sys, 'platform', platform):
                code, health = self.request('GET', '/api/clonecutter-health')
                self.assertEqual(code, 200)
                self.assertEqual(health['trashName'], expected)

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
