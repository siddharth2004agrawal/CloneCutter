import { FILE_TYPES } from '../lib/files.js';
import Icon from './Icon.jsx';

export default function FolderControls({ app }) {
  return (
    <section className="upload-section" aria-label="Scan setup">
      <div className="section-heading">
        <div><p className="eyebrow">01 / Scan</p><h3>Your whole filesystem</h3></div>
        <span className="section-symbol"><Icon name="folder" size={20} /></span>
      </div>
      <div className="folder-list is-empty">
        <div className="empty-folders">
          <span className="empty-folder-icon"><Icon name="layers" size={28} /></span>
          <p>Find copies across your computer</p>
          <span>Scan all accessible files and mounted drives.<br />No folder selection needed.</span>
        </div>
      </div>
      <p className="scan-scope-note">Virtual system files, symbolic links, and Trash are excluded. Files and folders your account cannot read are skipped.</p>
      <div className="file-types">
        <h4>Look for duplicates in</h4>
        {FILE_TYPES.map(([type, label]) => (
          <label key={type} className={app.fileTypes.includes(type) ? ' is-checked' : ''}>
            <input type="checkbox" value={type} checked={app.fileTypes.includes(type)} disabled={app.busy} onChange={(event) => app.toggleFileType(type, event.target.checked)} />{label}
          </label>
        ))}
      </div>
      <div className="scan-footer">
        <span><Icon name="shield" size={14} />Nothing is removed during a scan.</span>
        <button id="startScan" type="button" className="btn-primary" disabled={!app.canScan} onClick={app.startScan}>Scan filesystem<Icon name="arrow" size={17} /></button>
      </div>
    </section>
  );
}
