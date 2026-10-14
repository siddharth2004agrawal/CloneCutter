import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { requestJson } from '../lib/api.js';
import Icon from './Icon.jsx';

export default function FolderBrowser({ base, selected, onSelect, onClose }) {
  const browserRef = useRef(null);
  const [location, setLocation] = useState({ path: null });
  const [pathInput, setPathInput] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');

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

  return (
    <section className="folder-browser" aria-label="Folder browser" aria-busy={loading} ref={browserRef}>
      <p className="scan-scope-note">Click a folder to open it, then add the folder you want to scan. All its subfolders are included.</p>
      <div className="folder-shortcuts" aria-label="Quick locations">
        <button type="button" className="btn-secondary" disabled={loading} onClick={() => openFolder(null)}><Icon name="folder" size={15} />Home</button>
        {data?.shortcuts?.map((folder) => <button key={folder.path} type="button" className="btn-secondary" disabled={loading} onClick={() => openFolder(folder.path)}>{folder.name}</button>)}
      </div>
      {error && <p className="app-message app-error" role="alert">{error}</p>}
      {loading && <p className="scan-scope-note" role="status">Loading folders…</p>}
      {data && <div className="folder-browser-content" key={data.path}>
        <nav className="folder-navigation" aria-label="Folder navigation">
          <button type="button" className="btn-secondary" onClick={() => openFolder(data.parent)} disabled={loading || !data.parent}>Up one level</button>
          <ol className="folder-breadcrumbs">
            {(data.breadcrumbs || [{ name: data.path, path: data.path }]).map((folder) => <li key={folder.path}>
              <button type="button" disabled={loading} aria-current={folder.path === data.path ? 'location' : undefined} onClick={() => openFolder(folder.path)}>{folder.name}</button>
            </li>)}
          </ol>
        </nav>
        <label className="folder-filter" htmlFor="folderFilter">Find a folder here
          <input id="folderFilter" type="search" className="server-path-input" placeholder="Filter folders by name" value={filter} onChange={(event) => setFilter(event.target.value)} disabled={loading} />
        </label>
        <div className="folder-list" aria-label="Subfolders">
          {directories.map((folder) => (
            <button key={folder.path} type="button" className="folder-entry" disabled={loading} onClick={() => openFolder(folder.path)}>
              <Icon name="folder" size={17} /><span>{folder.name}</span><Icon name="arrow" size={14} />
            </button>
          ))}
          {!directories.length && <p className="scan-scope-note folder-browser-empty">{filter ? 'No folders match. Try another name.' : 'No subfolders. You can add this folder.'}</p>}
        </div>
        <p className="scan-scope-note folder-current-path">Selected location: <strong>{data.path}</strong></p>
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
  );
}
