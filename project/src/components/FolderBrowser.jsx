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

  return (
    <section className="folder-browser" aria-label="Folder browser" aria-busy={loading} ref={browserRef}>
      <p className="scan-scope-note">Browse folders on the computer running the local server, or enter an absolute folder path.</p>
      <form className="folder-path-form" onSubmit={(event) => {
        event.preventDefault();
        if (pathInput.trim()) setLocation({ path: pathInput.trim() });
      }}>
        <label htmlFor="browseFolderPath">Folder path</label>
        <div className="folder-path-row">
          <input id="browseFolderPath" className="server-path-input" value={pathInput} onChange={(event) => setPathInput(event.target.value)} placeholder="Enter an absolute folder path" disabled={loading} />
          <button type="submit" className="btn-secondary" disabled={loading || !pathInput.trim()}>Open</button>
        </div>
      </form>
      {error && <p className="app-message app-error" role="alert">{error}</p>}
      {loading && <p className="scan-scope-note" role="status">Loading folders…</p>}
      {data && <div className="folder-browser-content" key={data.path}>
        <div className="folder-buttons" aria-label="Folder navigation">
          <button type="button" className="btn-secondary" onClick={() => setLocation({ path: data.parent })} disabled={loading || !data.parent}>Up one level</button>
          {data.roots.map((root) => <button key={root} type="button" className="btn-secondary" disabled={loading} onClick={() => setLocation({ path: root })}>{root}</button>)}
        </div>
        <p className="scan-scope-note">Current folder: <strong>{data.path}</strong></p>
        <div className="folder-list" aria-label="Subfolders">
          {data.directories.map((folder) => (
            <button key={folder.path} type="button" className="folder-entry" disabled={loading} onClick={() => setLocation({ path: folder.path })}>
              <Icon name="folder" size={17} /><span>{folder.name}</span><Icon name="arrow" size={14} />
            </button>
          ))}
          {!data.directories.length && <p className="scan-scope-note folder-browser-empty">No subfolders. You can select this folder.</p>}
        </div>
      </div>}
      <div className="folder-buttons">
        <button type="button" className="btn-primary" disabled={loading || !data || selected.includes(data.path)} onClick={() => onSelect(data.path)}>
          <Icon name="plus" size={15} />{data && selected.includes(data.path) ? 'Folder already selected' : 'Select this folder'}
        </button>
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
      </div>
    </section>
  );
}
