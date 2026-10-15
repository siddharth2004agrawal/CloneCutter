import subprocess
import unittest
from unittest.mock import MagicMock, patch

from scripts import pick_folder


class NativePickerTests(unittest.TestCase):
    def linux_picker(self, returncode=0, stdout='/tmp/photos & documents\n', desktop='GNOME'):
        response = subprocess.CompletedProcess([], returncode, stdout, '')
        with patch.object(pick_folder.sys, 'platform', 'linux'), \
                patch.dict(pick_folder.os.environ, {'DISPLAY': ':0', 'XDG_CURRENT_DESKTOP': desktop}), \
                patch.object(pick_folder.shutil, 'which', side_effect=lambda tool: '/usr/bin/' + tool), \
                patch.object(pick_folder.subprocess, 'run', return_value=response) as run:
            selection = pick_folder.choose_folder('/tmp/start here')
        return selection, run.call_args.args[0]

    def test_linux_uses_zenity_with_literal_path_arguments(self):
        selection, command = self.linux_picker()
        self.assertEqual(selection, '/tmp/photos & documents')
        self.assertEqual(command[0], '/usr/bin/zenity')
        self.assertIn('--directory', command)
        self.assertIn('--filename=/tmp/start here/', command)

    def test_kde_prefers_kdialog(self):
        _, command = self.linux_picker(desktop='KDE')
        self.assertEqual(command[:3], ['/usr/bin/kdialog', '--getexistingdirectory', '/tmp/start here'])

    def test_linux_cancel_returns_no_selection(self):
        self.assertIsNone(self.linux_picker(returncode=1, stdout='')[0])

    def test_linux_failure_is_reported(self):
        with self.assertRaisesRegex(RuntimeError, 'desktop session'):
            self.linux_picker(returncode=2, stdout='')

    def test_headless_session_does_not_launch_dialog(self):
        with patch.object(pick_folder.sys, 'platform', 'linux'), \
                patch.dict(pick_folder.os.environ, {}, clear=True), \
                patch.object(pick_folder.subprocess, 'run') as run:
            with self.assertRaisesRegex(RuntimeError, 'desktop session'):
                pick_folder.choose_folder('/tmp')
            run.assert_not_called()

    def test_windows_and_macos_use_tk_native_dialog_and_destroy_root(self):
        for platform in ('win32', 'darwin'):
            with self.subTest(platform=platform):
                tk = MagicMock()
                tk.filedialog.askdirectory.return_value = '/chosen folder'
                with patch.object(pick_folder.sys, 'platform', platform), \
                        patch.dict('sys.modules', {'tkinter': tk, 'tkinter.filedialog': tk.filedialog}):
                    self.assertEqual(pick_folder.choose_folder('/initial'), '/chosen folder')
                tk.filedialog.askdirectory.assert_called_once_with(parent=tk.Tk.return_value,
                    title='CloneCutter - Choose a folder', initialdir='/initial', mustexist=True)
                tk.Tk.return_value.destroy.assert_called_once()

    def test_tk_cancel_returns_no_selection_and_cleans_up(self):
        tk = MagicMock()
        tk.filedialog.askdirectory.return_value = ''
        with patch.object(pick_folder.sys, 'platform', 'win32'), \
                patch.dict('sys.modules', {'tkinter': tk, 'tkinter.filedialog': tk.filedialog}):
            self.assertIsNone(pick_folder.choose_folder('/initial'))
        tk.Tk.return_value.destroy.assert_called_once()
