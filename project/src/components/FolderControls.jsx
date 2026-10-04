import { useRef } from 'react';
import { FILE_TYPES } from '../lib/files.js';

export default function FolderControls({ app, showFallback }) {
  const fallbackRef = useRef(null);
  return (
    <section className="upload-section" aria-label="Scan setup">
      <div className="folder-selector">
        <button id="selectFolders" type="button" className="btn-primary" disabled={app.busy} onClick={app.selectFolder}>
          {app.phase === 'selecting' ? '📁 Reading folder…' : '📁 Select Folders'}
        </button>
        {showFallback && (
          <button id="selectFoldersFallback" type="button" className="btn-secondary btn-fallback" disabled={app.busy} onClick={() => fallbackRef.current?.click()}>
            📂 Choose folder (fallback)
          </button>
        )}
        <input id="folderFallbackInput" ref={fallbackRef} type="file" className="hidden-input" aria-label="Choose folder for scan only" webkitdirectory="" multiple onChange={app.addFallbackFolder} disabled={app.busy} />
        <div id="folderList" className="folder-list">
          {!app.folders.length && <p className="empty-folders">No browser folders selected.</p>}
          {app.folders.map((folder) => (
            <div className="folder-item" key={folder.id}>
              <span>📁 {folder.name} ({folder.fileCount.toLocaleString()} files)</span>
              {folder.mode === 'filelist' && <span className="folder-badge">scan-only</span>}
              <button type="button" onClick={() => app.removeFolder(folder.id)} disabled={app.busy} aria-label={`Remove browser folder ${folder.name}`}>Remove</button>
            </div>
          ))}
        </div>
      </div>
      <div className="file-types">
        <h3>File Types to Scan:</h3>
        {FILE_TYPES.map(([type, label]) => (
          <label key={type}>
            <input type="checkbox" value={type} checked={app.fileTypes.includes(type)} disabled={app.busy} onChange={(event) => app.toggleFileType(type, event.target.checked)} />
            {label}
          </label>
        ))}
      </div>
      <button id="startScan" type="button" className="btn-primary" disabled={!app.canScan} onClick={app.startScan}>🔍 Start Scan</button>
    </section>
  );
}
