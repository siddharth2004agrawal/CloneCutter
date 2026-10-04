import { useState } from 'react';
import { formatBytes } from '../lib/files.js';
import DuplicateGroup from './DuplicateGroup.jsx';
import Icon from './Icon.jsx';

export default function ScanResults({ app }) {
  const [page, setPage] = useState(0);
  const pageSize = 25;
  const pages = Math.max(1, Math.ceil(app.duplicates.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const extraCopies = app.duplicates.reduce((sum, group) => sum + group.files.length - 1, 0);
  const spaceSaved = app.duplicates.reduce((sum, group) => sum + (group.files.length - 1) * group.files[0].size, 0);
  return (
    <section id="resultsSection" className="results-section" aria-label="Scan results" aria-busy={app.busy}>
      <div className="section-heading results-heading">
        <div><p className="eyebrow">02 / Review</p><h3>{app.duplicates.length ? 'Choose the copies to delete.' : 'Everything in its place.'}</h3></div>
        <span className="results-source">Whole filesystem</span>
      </div>
      <div className="stats">
        <div className="stat"><span id="totalDuplicates">{extraCopies.toLocaleString()}</span><small>Duplicate Copies · {app.duplicates.length.toLocaleString()} groups</small></div>
        <div className="stat"><span id="totalFiles">{app.totalFiles.toLocaleString()}</span><small>Files Checked in Last Scan</small></div>
        <div className="stat"><span id="spaceSaved">{formatBytes(spaceSaved)}</span><small>Potential Space Saved</small></div>
      </div>
      <p className="scan-scope-note">Scanned: {app.scanSource.roots?.join(', ')}. Virtual files, links, and Trash excluded.{app.scanSource.skipped > 0 && ` ${app.scanSource.skipped.toLocaleString()} inaccessible or changed files / folders skipped.`}</p>
      {app.duplicates.length > 0 && <>
        <p className="actions-hint">Check copies to delete, or <strong>select all extra copies</strong>{pages > 1 ? ' across all pages' : ''}. One copy in every group is marked <strong>Keep</strong> and cannot be selected for deletion. Selected files go to Trash / Recycle Bin.</p>
        {!app.deleteAllowed && <p className="delete-support-note" role="status">Deletion requires a connected local server with send2trash installed.</p>}
        <div className="actions">
          <button id="selectAll" type="button" className="btn-secondary" disabled={app.busy} onClick={() => app.selectCopies(true)}>Select all copies</button>
          <button id="clearAll" type="button" className="btn-secondary" disabled={app.busy || !app.selectedCount} onClick={() => app.selectCopies(false)}>Clear selection</button>
          <button id="removeSelected" type="button" className="btn-danger" disabled={app.busy || !app.deleteAllowed || !app.selectedCount} onClick={app.removeCopies}><Icon name="trash" size={15} />Delete selected ({app.selectedCount})</button>
        </div>
        <div className="keep-options">
          <span>Keep across all groups:</span>
          <button id="keepOldest" type="button" className="text-button" disabled={app.busy} onClick={() => app.chooseAll('oldest')}>Oldest</button>
          <button id="keepNewest" type="button" className="text-button" disabled={app.busy} onClick={() => app.chooseAll('newest')}>Newest</button>
          <span className="selection-summary" role="status">{app.selectedCount} selected · {formatBytes(app.selectedBytes)}</span>
        </div>
      </>}
      <div id="duplicatesList" className="duplicates-list">
        {app.duplicates.length ? app.duplicates.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map((group) => (
          <DuplicateGroup key={group.id} group={group} onChoose={app.chooseCopy} onToggle={app.toggleCopy} disabled={app.busy} serverBase={app.scanSource.base} />
        )) : <div className="empty-results" role="status"><span className="empty-result-icon"><Icon name="check" size={24} /></span><p>No duplicate copies remaining.</p><span>No identical copies remain in these results. Scan again to check for new files.</span></div>}
      </div>
      {pages > 1 && <nav className="results-pagination" aria-label="Duplicate result pages">
        <button className="btn-secondary" type="button" disabled={app.busy || currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button>
        <span role="status">Page {currentPage + 1} of {pages} · {app.duplicates.length.toLocaleString()} groups</span>
        <button className="btn-secondary" type="button" disabled={app.busy || currentPage === pages - 1} onClick={() => setPage(currentPage + 1)}>Next</button>
      </nav>}
    </section>
  );
}
