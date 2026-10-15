import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { gsap } from 'gsap';
import { requestJson } from '../lib/api.js';
import { formatBytes } from '../lib/files.js';
import Icon from './Icon.jsx';

export default function FolderBrowser({ base, selected, onSelect, onClose }) {
  const browserRef = useRef(null);
  const dialogRef = useRef(null);
  const [location, setLocation] = useState({ path: null });
  const [pathInput, setPathInput] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  function openFolder(path) {
    setFilter('');
    setLocation({ path });
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const query = location.path === null ? '' : `?path=${encodeURIComponent(location.path)}`;
    requestJson(base, `/api/folders${query}`, undefined, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result);
        setPathInput(result.path);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message || 'Could not open folder.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [base, location]);

  useEffect(() => {
    if (!data || loading) return undefined;
    const animations = gsap.matchMedia();
    animations.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.fromTo(browserRef.current.querySelectorAll('.folder-browser-content > *'),
        { y: 7, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.24, stagger: 0.035, ease: 'power2.out' });
    }, browserRef);
    return () => animations.revert();
  }, [data?.path, loading]);

  const directories = (data?.directories || []).filter((folder) => folder.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase()));
  const files = (data?.files || []).filter((file) => file.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase()));

  return createPortal(
    <dialog className="folder-dialog" ref={dialogRef} aria-labelledby="folderBrowserTitle" aria-describedby="folderBrowserHelp" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="folder-browser" aria-label="Folder browser" aria-busy={loading} ref={browserRef}>
      <div className="folder-browser-heading">
        <h3 id="folderBrowserTitle">Choose a folder</h3>
        <button type="button" className="icon-button" aria-label="Close folder browser" onClick={onClose} autoFocus><Icon name="close" size={18} /></button>
      </div>
      <p id="folderBrowserHelp" className="scan-scope-note">Browse folders and files below. Open a folder, then click Add this folder to scan it and all its subfolders.</p>
      <div className="folder-shortcuts" aria-label="Quick locations">
        <button type="button" className="btn-secondary" disabled={loading} onClick={() => openFolder(null)}><Icon name="folder" size={15} />Home</button>
        {data?.shortcuts?.map((folder) => <button key={folder.path} type="button" className="btn-secondary" disabled={loading} onClick={() => openFolder(folder.path)}>{folder.name}</button>)}
      </div>
      {error && <p className="app-message app-error" role="alert">{error}</p>}
      {loading && <p className="scan-scope-note" role="status">Loading folders and files…</p>}
      {data && <div className="folder-browser-content" key={data.path}>
        <nav className="folder-navigation" aria-label="Folder navigation">
          <button type="button" className="btn-secondary" onClick={() => openFolder(data.parent)} disabled={loading || !data.parent}>Up one level</button>
          <ol className="folder-breadcrumbs">
            {(data.breadcrumbs || [{ name: data.path, path: data.path }]).map((folder) => <li key={folder.path}>
              <button type="button" disabled={loading} aria-current={folder.path === data.path ? 'location' : undefined} onClick={() => openFolder(folder.path)}>{folder.name}</button>
            </li>)}
          </ol>
        </nav>
        <label className="folder-filter" htmlFor="folderFilter">Find a folder or file here
          <input id="folderFilter" type="search" className="server-path-input" placeholder="Filter folders and files by name" value={filter} onChange={(event) => setFilter(event.target.value)} disabled={loading} />
        </label>
        <ul className="folder-list folder-browser-entries" aria-label="Folders and files">
          {directories.map((folder) => (
            <li key={folder.path}><button type="button" className="folder-entry" disabled={loading} onClick={() => openFolder(folder.path)}>
              <Icon name="folder" size={17} /><span>{folder.name}</span><small>Folder</small><Icon name="arrow" size={14} />
            </button>
            </li>
          ))}
          {files.map((file) => <li key={file.path}>
            <div className="folder-entry folder-file"><Icon name="file" size={17} /><span>{file.name}</span><small>File · {formatBytes(file.size)}</small></div>
          </li>)}
          {!directories.length && !files.length && <li className="scan-scope-note folder-browser-empty">{filter ? 'No folders or files match. Try another name.' : 'This folder is empty. You can still add it.'}</li>}
        </ul>
        <p className="scan-scope-note folder-current-path">Current folder: <strong>{data.path}</strong></p>
      </div>}
      <details className="folder-manual-path">
        <summary>Enter a path instead</summary>
        <form className="folder-path-form" onSubmit={(event) => {
          event.preventDefault();
          if (pathInput.trim()) openFolder(pathInput.trim());
        }}>
          <label htmlFor="browseFolderPath">Folder path</label>
          <div className="folder-path-row">
            <input id="browseFolderPath" className="server-path-input" value={pathInput} onChange={(event) => setPathInput(event.target.value)} placeholder="Enter an absolute folder path" disabled={loading} />
            <button type="submit" className="btn-secondary" disabled={loading || !pathInput.trim()}>Open</button>
          </div>
        </form>
      </details>
      <div className="folder-buttons">
        <button type="button" className="btn-primary" disabled={loading || Boolean(error) || !data || selected.includes(data.path)} onClick={() => onSelect(data.path)}>
          <Icon name="plus" size={15} />{data && selected.includes(data.path) ? 'Folder already added' : 'Add this folder'}
        </button>
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </section>
    </dialog>, document.body,
  );
}
