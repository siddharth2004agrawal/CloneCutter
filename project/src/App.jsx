import useCloneCutter from './hooks/useCloneCutter.js';
import FolderControls from './components/FolderControls.jsx';
import ScanResults from './components/ScanResults.jsx';
import ServerPanel from './components/ServerPanel.jsx';
import Icon from './components/Icon.jsx';
import { formatBytes } from './lib/files.js';

export default function App() {
  const app = useCloneCutter();
  const working = app.phase === 'scanning' || app.phase === 'deleting';

  return (
    <main className="container">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark"><Icon name="layers" size={23} /></span>
          <h1>CloneCutter<span>File clarity, made simple.</span></h1>
        </div>
        <div className={`connection-status${app.api.available ? ' connected' : ''}`} role="status">
          <span className="status-dot" />
          {app.api.checking ? 'Connecting…' : app.api.available ? 'Local server connected' : 'Local server offline'}
        </div>
      </header>

      <section className="intro" aria-label="Welcome">
        <div>
          <p className="eyebrow">A cleaner digital space</p>
          <h2>Keep what matters.</h2>
          <p className="intro-description">Find identical files across your whole filesystem,<br className="desktop-break" /> select extra copies, and make a little more room.</p>
        </div>
        <div className="intro-detail">
          <Icon name="layers" size={20} />
          <p>A little less clutter.<br /><span>A lot more space.</span></p>
        </div>
      </section>

      {app.error && <div className="app-message app-error" role="alert">{app.error}</div>}
      {app.notice && <div className="app-message app-notice" role="status">{app.notice}</div>}

      <section className="cleared-summary" aria-label="Total space cleared" role="status" aria-live="polite" aria-atomic="true">
        <div>
          <p className="eyebrow">Total space cleared</p>
          <p id="totalSpaceCleared" className="cleared-total">{formatBytes(app.cleared.bytes)}</p>
          <p className="cleared-files">{app.cleared.files.toLocaleString()} duplicate {app.cleared.files === 1 ? 'file' : 'files'} moved this session</p>
        </div>
        <p className="cleared-note">Total size of copies moved to Trash / Recycle Bin.<br />Empty your system’s Trash to reclaim disk space.</p>
      </section>

      <div className={`workspace-grid${working ? ' is-working' : ''}`}>
        {!working && <FolderControls app={app} />}
        <ServerPanel app={app} />
      </div>

      {working && (
        <section id="progressSection" className="progress-section" aria-label="Operation progress" aria-busy="true">
          <span className="progress-icon"><Icon name={app.phase === 'deleting' ? 'trash' : 'search'} size={23} /></span>
          <p className="eyebrow">{app.phase === 'deleting' ? 'Making room' : 'Finding the matches'}</p>
          <h3>{app.phase === 'deleting' ? 'A little more space, coming up.' : 'Every file, thoughtfully checked.'}</h3>
          <div className="progress-bar" role="progressbar" aria-label="Scan progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={app.progress.value}>
            <div id="progressFill" className="progress-fill" style={{ width: `${Math.max(0, Math.min(100, app.progress.value))}%` }} />
          </div>
          <div id="progressText" className="progress-text" role="status">{app.progress.message}</div>
          {app.phase === 'scanning' && <button className="btn-secondary cancel-scan" type="button" onClick={app.cancelScan} disabled={app.cancelling}>{app.cancelling ? 'Cancelling…' : 'Cancel scan'}</button>}
        </section>
      )}

      {app.scanSource && !working && <ScanResults app={app} />}

      <footer className="app-footer">
        <span><Icon name="shield" size={14} /> Full-content verification</span>
        <span>One good copy is all you need.</span>
      </footer>
    </main>
  );
}
