import { formatBytes } from '../lib/files.js';
import DuplicateGroup from './DuplicateGroup.jsx';

export default function ScanResults({ app }) {
  const serverMode = app.scanSource.mode === 'server';
  const spaceSaved = app.duplicates.reduce((sum, group) => sum + (group.files.length - 1) * group.files[0].size, 0);
  return (
    <section id="resultsSection" className="results-section" aria-label="Scan results" aria-busy={app.busy}>
      <div className="stats">
        <div className="stat"><span id="totalDuplicates">{app.duplicates.length}</span><small>Duplicate Groups</small></div>
        <div className="stat"><span id="totalFiles">{app.totalFiles}</span><small>Total Files Scanned</small></div>
        <div className="stat"><span id="spaceSaved">{formatBytes(spaceSaved)}</span><small>Potential Space Saved</small></div>
      </div>
      <p className="actions-hint">Pick <strong>one copy to keep</strong> per group. {serverMode
        ? 'Other copies will be sent to the system Recycle Bin.'
        : app.deleteAllowed ? 'Other copies will be permanently deleted from disk.' : 'These folders can be scanned without deleting files.'}</p>
      {!app.deleteAllowed && (
        <p id="deleteSupportNote" className="delete-support-note" role="status">
          {app.scanOnly
            ? 'Scan-only mode: use Select Folders or server mode to enable deletion.'
            : 'Deletion is unavailable for this scan. Use server mode or a browser with folder picker support.'}
        </p>
      )}
      <div className="actions">
        <button id="keepOldest" type="button" className="btn-secondary" disabled={app.busy || !app.duplicates.length} onClick={() => app.chooseAll('oldest')}>Keep oldest in each group</button>
        <button id="keepNewest" type="button" className="btn-secondary" disabled={app.busy || !app.duplicates.length} onClick={() => app.chooseAll('newest')}>Keep newest in each group</button>
        <button id="removeSelected" type="button" className="btn-danger" disabled={app.busy || !app.deleteAllowed || !app.duplicates.length} onClick={app.removeCopies}>
          🗑️ Remove other copies (keep selected)
        </button>
      </div>
      <div id="duplicatesList" className="duplicates-list">
        {app.duplicates.length ? app.duplicates.map((group) => (
          <DuplicateGroup key={group.id} group={group} onChoose={app.chooseCopy} disabled={app.busy} serverBase={serverMode ? app.scanSource.base : undefined} />
        )) : <p className="empty-results" role="status">No duplicate files found.</p>}
      </div>
    </section>
  );
}
