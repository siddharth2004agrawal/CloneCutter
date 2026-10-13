import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { basename, formatBytes } from '../lib/files.js';
import DuplicateGroup from './DuplicateGroup.jsx';
import Icon from './Icon.jsx';

export default function ScanResults({ app }) {
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('largest');
  const pageSize = 25;
  const matchingGroups = app.duplicates.filter((group) => !query.trim() || group.files.some((file) => file.path.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
  const sortedGroups = [...matchingGroups].sort((a, b) => {
    if (sort === 'name') return basename(a.files[0].path).localeCompare(basename(b.files[0].path), undefined, { sensitivity: 'base' });
    if (sort === 'copies') return (b.files.length - a.files.length) || (a.files[0].path.localeCompare(b.files[0].path));
    const savedA = (a.files.length - 1) * a.files[0].size;
    const savedB = (b.files.length - 1) * b.files[0].size;
    return (savedB - savedA) || a.files[0].path.localeCompare(b.files[0].path);
  });
  const pages = Math.max(1, Math.ceil(sortedGroups.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const matchingExtras = matchingGroups.reduce((sum, group) => sum + group.files.length - 1, 0);
  const matchingSelected = matchingGroups.reduce((sum, group) => sum + group.deleteIndices.length, 0);
  const extraCopies = app.duplicates.reduce((sum, group) => sum + group.files.length - 1, 0);
  const spaceSaved = app.duplicates.reduce((sum, group) => sum + (group.files.length - 1) * group.files[0].size, 0);
  const selectAllRef = useRef(null);
  const sectionRef = useRef(null);
  const previousSelection = useRef(app.selectedCount);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = matchingSelected > 0 && matchingSelected < matchingExtras;
  }, [matchingExtras, matchingSelected]);

  function exportCsv() {
    const cell = (value) => {
      const text = String(value ?? '');
      const safe = /^[\s]*[=+@\-]/.test(text) ? `'${text}` : text;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const rows = [['Duplicate group', 'SHA-256', 'File name', 'Path', 'Size (bytes)', 'Last modified', 'Review selection']];
    for (const group of app.duplicates) {
      for (const [index, file] of group.files.entries()) {
        rows.push([
          group.id, group.hash, basename(file.path), file.path, file.size,
          file.lastModified ? new Date(file.lastModified).toISOString() : '',
          group.deleteIndices.includes(index) ? 'Selected for deletion' : 'Not selected',
        ]);
      }
    }
    const csv = `\ufeff${rows.map((row) => row.map(cell).join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `clonecutter-review-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  useEffect(() => {
    const animations = gsap.matchMedia();
    animations.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.fromTo(sectionRef.current.querySelectorAll('.results-heading, .stats, .results-tools, .actions, .duplicate-group'),
        { y: 11, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.34, stagger: 0.045, ease: 'power2.out' });
    }, sectionRef);
    return () => animations.revert();
  }, [app.scanSource.scanId, currentPage]);

  useEffect(() => {
    if (previousSelection.current === app.selectedCount) return undefined;
    previousSelection.current = app.selectedCount;
    const animations = gsap.matchMedia();
    animations.add('(prefers-reduced-motion: no-preference)', () => {
      const summary = sectionRef.current?.querySelector('.selection-summary');
      if (summary) gsap.fromTo(summary, { y: 3, autoAlpha: 0.72 }, { y: 0, autoAlpha: 1, duration: 0.2, ease: 'power2.out', clearProps: 'transform,opacity,visibility' });
    }, sectionRef);
    return () => animations.revert();
  }, [app.selectedCount]);

  useEffect(() => {
    const animations = gsap.matchMedia();
    animations.add('(prefers-reduced-motion: no-preference)', () => {
      const groups = sectionRef.current?.querySelectorAll('.duplicate-group');
      if (groups?.length) gsap.fromTo(groups, { y: 5, autoAlpha: 0.72 }, { y: 0, autoAlpha: 1, duration: 0.2, stagger: 0.014, ease: 'power2.out', clearProps: 'transform,opacity,visibility' });
    }, sectionRef);
    return () => animations.revert();
  }, [query, sort]);
  return (
    <section id="resultsSection" className="results-section" aria-label="Scan results" aria-busy={app.busy} ref={sectionRef}>
      <div className="section-heading results-heading">
        <div><p className="eyebrow">02 / Review</p><h3>{app.duplicates.length ? 'Choose the copies to delete.' : 'Everything in its place.'}</h3></div>
        <span className="results-source">{app.scanSource.scope === 'folders' ? 'Selected folders' : 'Whole filesystem'}</span>
      </div>
      <div className="stats">
        <div className="stat"><span id="totalDuplicates">{extraCopies.toLocaleString()}</span><small>Duplicate Copies · {app.duplicates.length.toLocaleString()} groups</small></div>
        <div className="stat"><span id="totalFiles">{app.totalFiles.toLocaleString()}</span><small>Files Checked in Last Scan</small></div>
        <div className="stat"><span id="spaceSaved">{formatBytes(spaceSaved)}</span><small>Potential Space Saved</small></div>
      </div>
      <p className="scan-scope-note">Scanned: {app.scanSource.roots?.join(', ')}. Virtual files, links, and Trash excluded.{app.scanSource.skipped > 0 && ` ${app.scanSource.skipped.toLocaleString()} inaccessible or changed files / folders skipped.`}</p>
      {app.duplicates.length > 0 && <>
        <div className="results-tools">
          <label className="results-search">
            <Icon name="search" size={16} />
            <input type="search" aria-label="Search duplicate filenames and paths" placeholder="Search filenames or paths" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} />
          </label>
          <label className="results-sort-label" htmlFor="sortDuplicates">Sort by</label>
          <select id="sortDuplicates" className="results-sort" value={sort} onChange={(event) => { setSort(event.target.value); setPage(0); }}>
            <option value="largest">Space to reclaim</option>
            <option value="copies">Most copies</option>
            <option value="name">File name</option>
          </select>
          <button type="button" className="btn-secondary export-button" onClick={exportCsv} title="Download all duplicate matches with their current selection status"><Icon name="download" size={14} />Export CSV</button>
        </div>
        <p className="actions-hint">Select individual files for review, or use <strong>Select all</strong> to choose every extra copy{query.trim() ? ' matching your search' : ' across all results'}. At least one copy in each group stays. Export CSV downloads all duplicate matches and their current selection status.</p>
        {!app.deleteAllowed && <p className="delete-support-note" role="status">Deletion requires a connected local server with send2trash installed.</p>}
        <div className="actions">
          <label className="select-all-control">
            <input id="selectAll" ref={selectAllRef} type="checkbox" disabled={app.busy || matchingExtras === 0} checked={matchingExtras > 0 && matchingSelected === matchingExtras} onChange={(event) => app.selectCopies(event.target.checked, matchingGroups.map((group) => group.id))} />
            Select all{query.trim() ? ' matching' : ''}
          </label>
          <button id="clearAll" type="button" className="btn-secondary" disabled={app.busy || !app.selectedCount} onClick={() => app.selectCopies(false)}>Clear selection</button>
          <button id="removeSelected" type="button" className="btn-danger" title={`Move selected files to ${app.trashName}`} disabled={app.busy || !app.deleteAllowed || !app.selectedCount} onClick={app.removeCopies}><Icon name="trash" size={15} />Delete selected ({app.selectedCount})</button>
        </div>
      <p className="selection-summary" role="status">{app.selectedCount} selected across all results · {formatBytes(app.selectedBytes)}{query.trim() && matchingGroups.length !== app.duplicates.length ? ` · Showing ${matchingGroups.length} of ${app.duplicates.length} groups` : ''}</p>
      </>}
      <div id="duplicatesList" className="duplicates-list">
        {app.duplicates.length && sortedGroups.length ? sortedGroups.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map((group) => (
          <DuplicateGroup key={group.id} group={group} onToggle={app.toggleCopy} disabled={app.busy} serverBase={app.scanSource.base} trashName={app.trashName} />
        )) : <div className="empty-results" role="status"><span className="empty-result-icon"><Icon name="check" size={24} /></span><p>{app.duplicates.length ? 'No matching duplicate groups.' : 'No duplicate copies found.'}</p><span>{app.duplicates.length ? 'Try another filename or path, or clear your search.' : 'Your selected locations contain no identical copies.'}</span>{app.duplicates.length > 0 && <button type="button" className="text-button" onClick={() => setQuery('')}>Clear search</button>}</div>}
      </div>
      {pages > 1 && <nav className="results-pagination" aria-label="Duplicate result pages">
        <button className="btn-secondary" type="button" disabled={app.busy || currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button>
        <span role="status">Page {currentPage + 1} of {pages} · {sortedGroups.length.toLocaleString()} groups</span>
        <button className="btn-secondary" type="button" disabled={app.busy || currentPage === pages - 1} onClick={() => setPage(currentPage + 1)}>Next</button>
      </nav>}
    </section>
  );
}
