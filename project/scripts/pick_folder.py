"""Open a desktop folder chooser in its own process, separate from HTTP threads."""
import json
import os
import shutil
import subprocess
import sys


def choose_folder(initial):
    if sys.platform not in {"win32", "darwin"}:
        if not (os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY")):
            raise RuntimeError("Open CloneCutter from your desktop session to use the native folder picker.")
        desktop = os.environ.get("XDG_CURRENT_DESKTOP", "").lower()
        tools = ("kdialog", "zenity") if "kde" in desktop else ("zenity", "kdialog")
        for tool in tools:
            executable = shutil.which(tool)
            if not executable:
                continue
            if tool == "zenity":
                command = [executable, "--file-selection", "--directory",
                           "--title=CloneCutter - Choose a folder", "--filename=" + os.path.join(initial, "")]
            else:
                command = [executable, "--getexistingdirectory", initial,
                           "--title", "CloneCutter - Choose a folder"]
            result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8")
            if result.returncode == 1:
                return None
            if result.returncode != 0:
                raise RuntimeError("Could not open the native folder picker. Make sure CloneCutter is running in your desktop session.")
            return result.stdout.rstrip("\r\n") or None

    try:
        import tkinter
        from tkinter import filedialog
    except ImportError as error:
        raise RuntimeError("Native folder selection needs Zenity, KDialog, or Python Tk support (python3-tk on Linux).") from error
    root = tkinter.Tk()
    try:
        root.withdraw()
        root.attributes("-topmost", True)
        return filedialog.askdirectory(parent=root, title="CloneCutter - Choose a folder",
                                       initialdir=initial, mustexist=True) or None
    finally:
        root.destroy()


if __name__ == "__main__":
    try:
        print(json.dumps({"path": choose_folder(sys.argv[1])}))
    except Exception as error:
        print(json.dumps({"error": str(error)}))
        sys.exit(1)
