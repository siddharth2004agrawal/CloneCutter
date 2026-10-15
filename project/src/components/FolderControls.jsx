import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { FILE_TYPES } from '../lib/files.js';
import { pickFolder } from '../lib/api.js';
import Icon from './Icon.jsx';

export default function FolderControls({ app }) {
  const [picking, setPicking] = useState(false);
  const [pickerError, setPickerError] = useState('');
  const pickerPending = useRef(false);
  const pickerAbort = useRef(null);
  const browseButton = useRef(null);
  const controlsRef = useRef(null);
  const previousMode = useRef(null);
  const previousFileTypes = useRef(app.fileTypes);

  useEffect(() => () => pickerAbort.current?.abort(), []);

  useEffect(() => {
    const mode = app.scope;
    if (previousMode.current === null) {
      previousMode.current = mode;
      return undefined;
    }
    previousMode.current = mode;
    const animations = gsap.matchMedia();
    animations.add('(prefers-reduced-motion: no-preference)', () => {
      const targets = controlsRef.current?.querySelectorAll('.folder-list, .folder-buttons');
      if (targets?.length) gsap.fromTo(targets, { y: 8, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.24, stagger: 0.035, ease: 'power2.out', clearProps: 'transform,opacity,visibility' });
    }, controlsRef);
    return () => animations.revert();
  }, [app.scope]);

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

  async function chooseFolder() {
    if (pickerPending.current || app.busy) return;
    pickerPending.current = true;
    setPicking(true);
    setPickerError('');
    const controller = new AbortController();
    pickerAbort.current = controller;
    try {
      const connection = await app.connectApi();
      if (controller.signal.aborted) return;
      if (!connection?.available) throw new Error('Cannot reach the CloneCutter local server. Run npm run dev in the project folder, then reload this page.');
      if (!connection.nativeFolderPicker) throw new Error('Restart npm run dev to load native folder selection, then reload this page.');
      const selection = await pickFolder(connection.base, {
        ...(app.folders.length ? { initialPath: app.folders[app.folders.length - 1] } : {}),
      }, controller.signal);
      if (selection.path) app.addFolder(selection.path);
    } catch (error) {
      if (!controller.signal.aborted) setPickerError(error.message || 'Could not open the native folder picker.');
    } finally {
      pickerPending.current = false;
      if (!controller.signal.aborted) {
        setPicking(false);
        browseButton.current?.focus();
      }
    }
  }
  return (
    <section className="upload-section" aria-label="Scan setup" ref={controlsRef}>
      <div className="section-heading">
        <div><p className="eyebrow">01 / Scan</p><h3>{app.scope === 'folders' ? 'Your selected folders' : 'Your whole filesystem'}</h3></div>
        <span className="section-symbol"><Icon name="folder" size={20} /></span>
      </div>
      <fieldset className="scan-scope" disabled={app.busy || picking}>
        <legend>Where to search</legend>
        <label><input type="radio" name="scanScope" checked={app.scope === 'filesystem'} onChange={() => app.setScope('filesystem')} />Whole filesystem</label>
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
              <button type="button" className="icon-button" aria-label={`Remove ${path} from scan`} disabled={app.busy || picking} onClick={() => app.removeFolder(path)}><Icon name="close" size={15} /></button>
            </div>
          )) : <div className="empty-folders">
            <span className="empty-folder-icon"><Icon name="folder" size={28} /></span>
            <p>Select folders to search</p>
            <span>Click Choose folders to open your system’s folder picker.<br />Subfolders are included automatically.</span>
          </div>}
        </div>
        <div className="folder-buttons">
          <button ref={browseButton} type="button" className="btn-secondary" disabled={app.busy || picking || !app.api.available} onClick={chooseFolder}><Icon name="folder" size={15} />{picking ? 'Choosing folder…' : app.folders.length ? 'Add another folder' : 'Choose folders'}</button>
        </div>
        {picking && <p className="scan-scope-note" role="status">Select a folder in the system dialog, or cancel to return.</p>}
        {pickerError && <p className="app-message app-error" role="alert">{pickerError}</p>}
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
        <button id="startScan" type="button" className="btn-primary" disabled={!app.canScan || picking} onClick={app.startScan}>{app.scope === 'folders' ? 'Scan selected folders' : 'Scan filesystem'}<Icon name="arrow" size={17} /></button>
      </div>
    </section>
  );
}
