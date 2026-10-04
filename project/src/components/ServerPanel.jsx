import Icon from './Icon.jsx';

export default function ServerPanel({ app }) {
  return (
    <section id="serverPanel" className="server-panel" aria-label="Local connection">
      <div className="section-heading">
        <div><p className="eyebrow">On your computer</p><h3>Local connection</h3></div>
        <span className="section-symbol"><Icon name="layers" size={20} /></span>
      </div>
      <p className="server-panel-text">Your files are scanned on the computer running CloneCutter’s local server. Selected duplicate copies go to Trash / Recycle Bin.</p>
      {!app.api.available && !app.api.checking && <div className="server-help">
        <p>Start the local server from the project folder:</p>
        <pre><code>pip install -r requirements.txt{'\n'}python server.py</code></pre>
        <p>Then reconnect to start a whole-filesystem scan.</p>
      </div>}
      {app.api.available && !app.api.canTrash && <p className="delete-support-note">Install deletion support with <code>pip install -r requirements.txt</code>, restart the server, and reconnect.</p>}
      <div className="server-panel-footer">
        <p id="serverStatus" className={`server-status${app.api.available ? ' ok' : ''}`} role="status">
          <span className="status-dot" />{app.api.checking ? 'Connecting…' : app.api.available ? 'Local server connected' : 'Local server offline'}
        </p>
        {!app.api.checking && <button type="button" className="text-button" onClick={app.connectApi} disabled={app.busy}><Icon name="refresh" size={13} />Reconnect</button>}
      </div>
    </section>
  );
}
