import useCloneCutter from './hooks/useCloneCutter.js';
import FolderControls from './components/FolderControls.jsx';
import ScanResults from './components/ScanResults.jsx';
import ServerPanel from './components/ServerPanel.jsx';

export default function App() {
  const app = useCloneCutter();
  const needsContext = !app.pickerSupported || !window.isSecureContext || window.location.protocol === 'file:';
  const working = app.phase === 'scanning' || app.phase === 'deleting';

  return (
    <main className="container">
      <header>
        <h1>🗑️ CloneCutter</h1>
        <p>Find and remove duplicate files across multiple folders</p>
      </header>

      {needsContext && (
        <div id="envWarning" className="env-warning" role="status">
          <strong>Folder picker needs the right context.</strong>{' '}
          Open this app on localhost or HTTPS in a browser with folder picker support.
          The fallback folder chooser scans only. Use server mode to send duplicates to the system Recycle Bin.
        </div>
      )}

      {app.error && <div className="app-message app-error" role="alert">{app.error}</div>}
      {app.notice && <div className="app-message app-notice" role="status">{app.notice}</div>}

      <ServerPanel app={app} />
      {!working && <FolderControls app={app} showFallback={needsContext} />}

      {working && (
        <section id="progressSection" className="progress-section" aria-label="Operation progress" aria-busy="true">
          <div className="progress-bar" role="progressbar" aria-label="Scan progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={app.progress.value}>
            <div id="progressFill" className="progress-fill" style={{ width: `${Math.max(0, Math.min(100, app.progress.value))}%` }} />
          </div>
          <div id="progressText" className="progress-text" role="status">{app.progress.message}</div>
        </section>
      )}

      {app.scanSource && !working && <ScanResults app={app} />}
    </main>
  );
}
