import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { basename, formatBytes, formatDate } from '../lib/files.js';
import FilePreview from './FilePreview.jsx';
import Icon from './Icon.jsx';

export default function DuplicateGroup({ group, onToggle, serverBase, trashName, disabled }) {
  const [expanded, setExpanded] = useState(true);
  const [filesVisible, setFilesVisible] = useState(true);
  const filesRef = useRef(null);
  const previousExpanded = useRef(expanded);
  const extra = group.files.length - 1;
  const firstName = basename(group.files[0].path);
  const totalSize = group.files.reduce((sum, file) => sum + file.size, 0);
  const filesId = `group-files-${group.id}`;

  useEffect(() => {
    if (previousExpanded.current === expanded) return undefined;
    previousExpanded.current = expanded;
    const animations = gsap.matchMedia();
    animations.add('(prefers-reduced-motion: reduce)', () => setFilesVisible(expanded));
    animations.add('(prefers-reduced-motion: no-preference)', () => {
      if (expanded) {
        gsap.fromTo(filesRef.current, { height: 0, autoAlpha: 0 }, {
          height: 'auto', autoAlpha: 1, duration: 0.27, ease: 'power2.out',
          onComplete: () => gsap.set(filesRef.current, { clearProps: 'height,opacity,visibility' }),
        });
      } else {
        gsap.to(filesRef.current, {
          height: 0, autoAlpha: 0, duration: 0.19, ease: 'power1.in',
          onComplete: () => {
            setFilesVisible(false);
            gsap.set(filesRef.current, { clearProps: 'height,opacity,visibility' });
          },
        });
      }
    }, filesRef);
    return () => animations.revert();
  }, [expanded]);

  function toggleExpanded() {
    const next = !expanded;
    if (next) setFilesVisible(true);
    setExpanded(next);
  }

  return (
    <article className="duplicate-group" data-group-id={group.id}>
      <div className="group-header" onClick={toggleExpanded}>
        <div className="group-info">
          <h4>{firstName}<span className="copy-count">{extra === 1 ? '1 extra copy' : `${extra} extra copies`}</span></h4>
          <div className="group-stats">
            <Icon name="check" size={13} />{group.files.length} identical files<span className="meta-divider">·</span>{formatBytes(totalSize)} total
          </div>
        </div>
        <span className="group-saving">{formatBytes(extra * group.files[0].size)} to reclaim</span>
        <button className={`group-toggle${expanded ? ' is-expanded' : ''}`} type="button" aria-label={`Toggle copies of ${firstName}`} aria-expanded={expanded} aria-controls={filesId} onClick={(event) => { event.stopPropagation(); toggleExpanded(); }}><Icon name="chevron" size={17} /></button>
      </div>
      <div id={filesId} ref={filesRef} className={`group-files${expanded ? ' expanded' : ''}`} hidden={!filesVisible}>
        <p className="group-choice-note">{group.deleteIndices.length} selected to delete · {group.files.length - group.deleteIndices.length} will stay. At least one copy must remain.</p>
        {group.files.map((file, index) => (
          <div className={`file-item${group.deleteIndices.includes(index) ? ' for-deletion' : ''}`} key={file.id || file.path}>
            <label className="delete-cell" title={!group.deleteIndices.includes(index) && group.deleteIndices.length === group.files.length - 1 ? 'At least one identical copy must remain. Uncheck another file to select this one.' : `Move this file to ${trashName}`}>
              <input className="file-checkbox" type="checkbox" checked={group.deleteIndices.includes(index)} disabled={disabled || (!group.deleteIndices.includes(index) && group.deleteIndices.length === group.files.length - 1)} onChange={(event) => onToggle(group.id, index, event.target.checked)} aria-label={`Select ${file.path} for deletion`} />
              <span>Delete</span>
            </label>
            <FilePreview file={file} serverBase={serverBase} />
            <div className="file-info">
              <div className="file-name">{basename(file.path)}</div>
              <div className="file-details">{file.path}</div>
              <div className="file-meta">Modified {formatDate(file.lastModified)}</div>
              <div className="file-decision">{group.deleteIndices.includes(index) ? `Will move to ${trashName}` : 'Will stay'}</div>
            </div>
            <div className="file-size">{formatBytes(file.size)}</div>
          </div>
        ))}
      </div>
    </article>
  );
}
