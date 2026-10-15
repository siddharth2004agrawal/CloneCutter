import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { FILE_TYPES } from '../lib/files.js';
import FolderBrowser from './FolderBrowser.jsx';
import Icon from './Icon.jsx';

export default function FolderControls({ app }) {
  const [browsing, setBrowsing] = useState(false);
  const browseButton = useRef(null);
  const controlsRef = useRef(null);
  const previousMode = useRef(null);
  const previousFileTypes = useRef(app.fileTypes);

  useEffect(() => {
    const mode = `${app.scope}:${browsing}`;
    if (previousMode.current === null) {
      previousMode.current = mode;
      return undefined;
    }
    previousMode.current = mode;
    const animations = gsap.matchMedia();
    animations.add('(prefers-reduced-motion: no-preference)', () => {
      const targets = controlsRef.current?.querySelectorAll('.folder-list, .folder-buttons, .folder-browser');
      if (targets?.length) gsap.fromTo(targets, { y: 8, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.24, stagger: 0.035, ease: 'power2.out', clearProps: 'transform,opacity,visibility' });
    }, controlsRef);
    return () => animations.revert();
  }, [app.scope, browsing]);

  useEffect(() => {
    if (previousFileTypes.current === app.fileTypes) return undefined;
    previousFileTypes.current = app.fileTypes;
    const animations = gsap.matchMedia();
    animations.add('(prefers-reduced-motion: no-preference)', () => {
      const selectedTypes = controlsRef.current?.querySelectorAll('.file-types label.is-checked');
      if (selectedTypes?.length) gsap.fromTo(selectedTypes, { scale: 0.96 }, { scale: 1, duration: 0.24, stagger: 0.025, ease: 'back.out(2)', clearProps: 'transform' });
    }, controlsRef);
    return () => animations.revert();
  }, [app.fileTypes]);

  function closeBrowser() {
    setBrowsing(false);
    browseButton.current?.focus();
  }
  return (
    <section className="upload-section" aria-label="Scan setup" ref={controlsRef}>
      <div className="section-heading">
        <div><p className="eyebrow">01 / Scan</p><h3>{app.scope === 'folders' ? 'Your selected folders' : 'Your whole filesystem'}</h3></div>
        <span className="section-symbol"><Icon name="folder" size={20} /></span>
      </div>
      <fieldset className="scan-scope" disabled={app.busy}>
        <legend>Where to search</legend>
        <label><input type="radio" name="scanScope" checked={app.scope === 'filesystem'} onChange={() => { app.setScope('filesystem'); setBrowsing(false); }} />Whole filesystem</label>
        <label><input type="radio" name="scanScope" checked={app.scope === 'folders'} onChange={() => app.setScope('folders')} />Selected folders</label>
      </fieldset>
      {app.scope === 'filesystem' ? <div className="folder-list is-empty">
        <div className="empty-folders">
          <span className="empty-folder-icon"><Icon name="layers" size={28} /></span>
          <p>Find copies across your computer</p>
          <span>Scan all accessible files and mounted drives.<br />No folder selection needed.</span>
        </div>
      </div> : <>
        <div className={`folder-list${app.folders.length ? '' : ' is-empty'}`} aria-label="Selected scan folders">
          {app.folders.length ? app.folders.map((path) => (
            <div className="folder-item" key={path}>
              <Icon name="folder" size={19} />
              <div className="folder-item-info"><span>{path}</span><small>Includes all subfolders</small></div>
              <button type="button" className="icon-button" aria-label={`Remove ${path} from scan`} disabled={app.busy} onClick={() => app.removeFolder(path)}><Icon name="close" size={15} /></button>
            </div>
          )) : <div className="empty-folders">
            <span className="empty-folder-icon"><Icon name="folder" size={28} /></span>
            <p>Select folders to search</p>
            <span>Click Choose folders to browse your folders and drives.<br />Subfolders are included automatically.</span>
          </div>}
        </div>
        <div className="folder-buttons">
          <button ref={browseButton} type="button" className="btn-secondary" disabled={app.busy || !app.api.available} aria-haspopup="dialog" aria-expanded={browsing} onClick={() => setBrowsing(true)}><Icon name="folder" size={15} />{app.folders.length ? 'Add another folder' : 'Choose folders'}</button>
        </div>
        {browsing && <FolderBrowser base={app.api.base} selected={app.folders} onSelect={(path) => { app.addFolder(path); closeBrowser(); }} onClose={closeBrowser} />}
      </>}
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
        <button id="startScan" type="button" className="btn-primary" disabled={!app.canScan} onClick={app.startScan}>{app.scope === 'folders' ? 'Scan selected folders' : 'Scan filesystem'}<Icon name="arrow" size={17} /></button>
      </div>
    </section>
  );
}
