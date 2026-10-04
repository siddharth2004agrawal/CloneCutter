import { useRef } from 'react';
import { FILE_TYPES } from '../lib/files.js';
import Icon from './Icon.jsx';

export default function FolderControls({ app, showFallback }) {
  const fallbackRef = useRef(null);
  return (
    <section className="upload-section" aria-label="Scan setup">
      <div className="section-heading">
        <div>
          <p className="eyebrow">01 / Choose</p>
          <h3>Your folders</h3>
        </div>
        <span className="section-symbol"><Icon name="folder" size={20} /></span>
      </div>
      <div className="folder-selector">
        <input id="folderFallbackInput" ref={fallbackRef} type="file" className="hidden-input" aria-label="Choose folder for scan only" webkitdirectory="" multiple onChange={app.addFallbackFolder} disabled={app.busy} />
        <div id="folderList" className={`folder-list${!app.folders.length ? ' is-empty' : ''}`}>
          {!app.folders.length && (
            <div className="empty-folders">
              <span className="empty-folder-icon"><Icon name="folder" size={28} /></span>
              <p>A fresh start for your files</p>
              <span>Select one or more folders to find their duplicates.</span>
            </div>
          )}
          {app.folders.map((folder) => (
            <div className="folder-item" key={folder.id}>
              <Icon name="folder" size={18} />
              <div className="folder-item-info"><span>{folder.name}</span><small>{folder.fileCount.toLocaleString()} files</small></div>
              {folder.mode === 'filelist' && <span className="folder-badge">scan-only</span>}
              <button type="button" className="icon-button" onClick={() => app.removeFolder(folder.id)} disabled={app.busy} aria-label={`Remove browser folder ${folder.name}`}><Icon name="close" size={15} /></button>
            </div>
          ))}
        </div>
        <div className="folder-buttons">
          <button id="selectFolders" type="button" className="btn-secondary" disabled={app.busy || !app.pickerSupported || !window.isSecureContext} onClick={app.selectFolder}>
            <Icon name="plus" size={16} />{app.phase === 'selecting' ? 'Reading folder…' : 'Select folders'}
          </button>
          {showFallback && (
            <button id="selectFoldersFallback" type="button" className="btn-secondary" disabled={app.busy} onClick={() => fallbackRef.current?.click()}>
              <Icon name="folder" size={16} />Choose folder (scan only)
            </button>
          )}
        </div>
      </div>
      <div className="file-types">
        <h4>Look for duplicates in</h4>
        {FILE_TYPES.map(([type, label]) => (
          <label key={type} className={app.fileTypes.includes(type) ? ' is-checked' : ''}>
            <input type="checkbox" value={type} checked={app.fileTypes.includes(type)} disabled={app.busy} onChange={(event) => app.toggleFileType(type, event.target.checked)} />
            {label}
          </label>
        ))}
      </div>
      <div className="scan-footer">
        <span><Icon name="shield" size={14} />Nothing is removed during a scan.</span>
        <button id="startScan" type="button" className="btn-primary" disabled={!app.canScan} onClick={app.startScan}>Find duplicates<Icon name="arrow" size={17} /></button>
      </div>
    </section>
  );
}
