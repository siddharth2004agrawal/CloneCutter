import { formatBytes } from '../lib/files.js';
import DuplicateGroup from './DuplicateGroup.jsx';
import Icon from './Icon.jsx';

export default function ScanResults({ app }) {
  const serverMode = app.scanSource.mode === 'server';
  const spaceSaved = app.duplicates.reduce((sum, group) => sum + (group.files.length - 1) * group.files[0].size, 0);
  return (
    <section id="resultsSection" className="results-section" aria-label="Scan results" aria-busy={app.busy}>
      <div className="section-heading results-heading">
        <div>
          <p className="eyebrow">02 / Review</p>
          <h3>{app.duplicates.length ? 'A little room to reclaim.' : 'Everything in its place.'}</h3>
        </div>
        <span className="results-source">{serverMode ? 'Local server scan' : 'Browser scan'}</span>
      </div>
      <div className="stats">
        <div className="stat"><span id="totalDuplicates">{app.duplicates.length}</span><small>Duplicate Groups</small></div>
        <div className="stat"><span id="totalFiles">{app.totalFiles}</span><small>Total Files Scanned</small></div>
        <div className="stat"><span id="spaceSaved">{formatBytes(spaceSaved)}</span><small>Potential Space Saved</small></div>
      </div>
      {app.duplicates.length > 0 && <p className="actions-hint">Choose <strong>one copy to keep</strong> in each group. {serverMode
        ? 'Other copies will be sent to the system Recycle Bin.'
        : app.deleteAllowed ? 'Other copies will be permanently deleted from disk.' : 'These folders can be scanned without deleting files.'}</p>}
      {!app.deleteAllowed && (
        <p id="deleteSupportNote" className="delete-support-note" role="status">
          {app.scanOnly
            ? 'Scan-only mode: use Select Folders or server mode to enable deletion.'
            : 'Deletion is unavailable for this scan. Use server mode or a browser with folder picker support.'}
        </p>
      )}
      {app.duplicates.length > 0 && <div className="actions">
        <span className="actions-label">Keep across all groups</span>
        <button id="keepOldest" type="button" className="btn-secondary" aria-label="Keep oldest in each group" disabled={app.busy} onClick={() => app.chooseAll('oldest')}>Oldest</button>
        <button id="keepNewest" type="button" className="btn-secondary" aria-label="Keep newest in each group" disabled={app.busy} onClick={() => app.chooseAll('newest')}>Newest</button>
        <button id="removeSelected" type="button" className="btn-danger" disabled={app.busy || !app.deleteAllowed || !app.duplicates.length} onClick={app.removeCopies}>
          <Icon name="trash" size={15} />Remove extra copies
        </button>
      </div>}
      <div id="duplicatesList" className="duplicates-list">
        {app.duplicates.length ? app.duplicates.map((group) => (
          <DuplicateGroup key={group.id} group={group} onChoose={app.chooseCopy} disabled={app.busy} serverBase={serverMode ? app.scanSource.base : undefined} />
        )) : <div className="empty-results" role="status"><span className="empty-result-icon"><Icon name="check" size={24} /></span><p>No duplicates. Just your originals.</p><span>All scanned files have unique content.</span></div>}
      </div>
    </section>
  );
}
