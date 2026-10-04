import { useState } from 'react';

export default function ServerPanel({ app }) {
  const [path, setPath] = useState('');
  if (!app.api.available && app.pickerSupported && !app.api.checking) return null;

  function addPath(event) {
    event.preventDefault();
    app.addServerPath(path);
    setPath('');
  }

  return (
    <section id="serverPanel" className="server-panel" aria-label="Server mode">
      <h3>Server mode (all browsers — Recycle Bin delete)</h3>
      <p className="server-panel-text">
        Add absolute folder paths to scan on your computer and send extra copies to the <strong>Recycle Bin</strong>.
        {app.serverRoots.length > 0 && ' Server folders take priority over browser folders.'}
      </p>
      <form className="server-path-row" onSubmit={addPath}>
        <input
          id="serverPathInput" className="server-path-input" aria-label="Absolute folder path"
          placeholder="e.g. /home/you/Pictures or C:\Users\You\Pictures" autoComplete="off"
          value={path} onChange={(event) => setPath(event.target.value)} disabled={app.busy}
        />
        <button id="serverAddPathBtn" type="submit" className="btn-secondary" disabled={app.busy || !path.trim()}>Add folder</button>
      </form>
      <ul id="serverPathList" className="server-path-list">
        {app.serverRoots.map((root) => (
          <li key={root}>
            <span>{root}</span>
            <button type="button" onClick={() => app.removeServerPath(root)} disabled={app.busy} aria-label={`Remove server folder ${root}`}>Remove</button>
          </li>
        ))}
      </ul>
      <p id="serverStatus" className={`server-status${app.api.available ? ' ok' : ''}`} role="status">
        {app.api.checking ? 'Checking local API…' : app.api.available
          ? 'Local API connected. Add folder paths, scan, then remove extra copies.'
          : 'Local API is offline. Start the Python server to use server mode.'}
      </p>
      {!app.api.available && !app.api.checking && (
        <button type="button" className="btn-secondary reconnect-button" onClick={app.connectApi} disabled={app.busy}>Reconnect</button>
      )}
    </section>
  );
}
