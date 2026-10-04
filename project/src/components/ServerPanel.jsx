import { useState } from 'react';
import Icon from './Icon.jsx';

export default function ServerPanel({ app }) {
  const [path, setPath] = useState('');

  function addPath(event) {
    event.preventDefault();
    app.addServerPath(path);
    setPath('');
  }

  return (
    <section id="serverPanel" className="server-panel" aria-label="Server mode">
      <div className="section-heading">
        <div>
          <p className="eyebrow">An alternative</p>
          <h3>Use a folder path</h3>
        </div>
        <span className="section-symbol"><Icon name="layers" size={20} /></span>
      </div>
      <p className="server-panel-text">
        Scan through the local server. Extra copies go to your system’s Recycle Bin.
      </p>
      <form className="server-path-row" onSubmit={addPath}>
        <input
          id="serverPathInput" className="server-path-input" aria-label="Absolute folder path"
          placeholder="/home/you/Pictures" autoComplete="off"
          value={path} onChange={(event) => setPath(event.target.value)} disabled={app.busy}
        />
        <button id="serverAddPathBtn" type="submit" className="btn-secondary" disabled={app.busy || !path.trim()}><Icon name="plus" size={15} />Add path</button>
      </form>
      <ul id="serverPathList" className="server-path-list">
        {app.serverRoots.map((root) => (
          <li key={root}>
            <Icon name="folder" size={15} /><span>{root}</span>
            <button type="button" className="icon-button" onClick={() => app.removeServerPath(root)} disabled={app.busy} aria-label={`Remove server folder ${root}`}><Icon name="close" size={14} /></button>
          </li>
        ))}
      </ul>
      {app.serverRoots.length > 0 && <p className="server-priority-note">Paths take priority over browser folders.</p>}
      <div className="server-panel-footer">
        <p id="serverStatus" className={`server-status${app.api.available ? ' ok' : ''}`} role="status">
          <span className="status-dot" />
          {app.api.checking ? 'Connecting…' : app.api.available ? 'Local server connected' : 'Local server offline'}
        </p>
        {!app.api.available && !app.api.checking && (
          <button type="button" className="text-button" onClick={app.connectApi} disabled={app.busy}><Icon name="refresh" size={13} />Reconnect</button>
        )}
      </div>
      {!app.api.available && !app.api.checking && <p className="server-help">Start the Python backend to use folder paths.</p>}
    </section>
  );
}
