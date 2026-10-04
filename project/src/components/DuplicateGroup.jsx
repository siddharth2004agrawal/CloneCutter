import { useState } from 'react';
import { basename, formatBytes, formatDate } from '../lib/files.js';
import FilePreview from './FilePreview.jsx';

export default function DuplicateGroup({ group, onChoose, serverBase, disabled }) {
  const [expanded, setExpanded] = useState(true);
  const extra = group.files.length - 1;
  const firstName = basename(group.files[0].path);
  const totalSize = group.files.reduce((sum, file) => sum + file.size, 0);
  const filesId = `group-files-${group.id}`;

  return (
    <article className="duplicate-group" data-group-id={group.id}>
      <div className="group-header" onClick={() => setExpanded((previous) => !previous)}>
        <div className="group-info">
          <h4>{firstName} ({extra === 1 ? '1 more copy' : `${extra} more copies`})</h4>
          <div className="group-stats">
            {group.files.length} identical files • {formatBytes(totalSize)} total • save {formatBytes(extra * group.files[0].size)} • hash {group.hash?.slice(0, 14)}…
          </div>
        </div>
        <button className="group-toggle" type="button" aria-label={`Toggle copies of ${firstName}`} aria-expanded={expanded} aria-controls={filesId}>{expanded ? '▼' : '▶'}</button>
      </div>
      <div id={filesId} className={`group-files${expanded ? ' expanded' : ''}`} hidden={!expanded}>
        {group.files.map((file, index) => (
          <div className={`file-item${group.selectedIndex === index ? ' selected' : ''}`} key={file.id || file.path}>
            <FilePreview file={file} serverBase={serverBase} />
            <label className="keep-cell">
              <input className="keep-radio" type="radio" name={`dupkeep-${group.id}`} value={index} checked={group.selectedIndex === index} disabled={disabled} onChange={() => onChoose(group.id, index)} aria-label={`Keep ${file.path}`} />
              <span>Keep</span>
            </label>
            <div className="file-info">
              <div className="file-name">{basename(file.path)}</div>
              <div className="file-details">{file.path} • {formatBytes(file.size)} • modified {formatDate(file.lastModified)}</div>
            </div>
            <div className="file-size">{formatBytes(file.size)}</div>
          </div>
        ))}
      </div>
    </article>
  );
}
