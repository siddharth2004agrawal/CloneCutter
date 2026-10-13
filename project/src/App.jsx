import useCloneCutter from './hooks/useCloneCutter.js';
import { gsap } from 'gsap';
import { useEffect, useRef } from 'react';
import FolderControls from './components/FolderControls.jsx';
import ScanResults from './components/ScanResults.jsx';
import Icon from './components/Icon.jsx';
import { formatBytes } from './lib/files.js';

export default function App() {
  const shell = useRef(null);
  const app = useCloneCutter();
  const working = app.phase === 'scanning' || app.phase === 'deleting';

  useEffect(() => {
    const animations = gsap.matchMedia();
    animations.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.timeline({ defaults: { duration: 0.55, ease: 'power2.out' } })
        .from('.app-header', { y: -10, autoAlpha: 0 })
        .from('.intro > *', { y: 18, autoAlpha: 0, stagger: 0.12 }, '-=0.28')
        .from('.hero-orbit', { scale: 0.86, autoAlpha: 0, stagger: 0.1, duration: 0.8 }, '-=0.42')
        .from('.hero-file-stack', { y: 9, scale: 0.92, autoAlpha: 0, duration: 0.48 }, '-=0.58')
        .from('.cleared-summary', { y: 12, autoAlpha: 0 }, '-=0.3')
        .from('.upload-section', { y: 15, autoAlpha: 0 }, '-=0.3');
    }, shell);
    return () => animations.revert();
  }, []);

  useEffect(() => {
    const animations = gsap.matchMedia();
    animations.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.to('.hero-file-stack', { y: -3, delay: 1.25, duration: 2.8, repeat: -1, yoyo: true, ease: 'sine.inOut' });
      gsap.to('.intro-eyebrow-dot', { scale: 1.18, duration: 1.8, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    }, shell);
    return () => animations.revert();
  }, []);

  const previousClearedFiles = useRef(app.cleared.files);
  useEffect(() => {
    if (previousClearedFiles.current === app.cleared.files) return undefined;
    previousClearedFiles.current = app.cleared.files;
    const animations = gsap.matchMedia();
    animations.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.fromTo('.cleared-icon', { scale: 0.88 }, { scale: 1, duration: 0.42, ease: 'back.out(2)', clearProps: 'transform' });
      gsap.fromTo('#totalSpaceCleared', { y: 4, autoAlpha: 0.65 }, { y: 0, autoAlpha: 1, duration: 0.28, ease: 'power2.out', clearProps: 'transform,opacity,visibility' });
    }, shell);
    return () => animations.revert();
  }, [app.cleared.files]);

  useEffect(() => {
    if (!working) return undefined;
    const animations = gsap.matchMedia();
    animations.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.fromTo('#progressSection', { y: 12, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.28, ease: 'power2.out' });
    }, shell);
    return () => animations.revert();
  }, [working]);

  useEffect(() => {
    if (!working) return undefined;
    const animations = gsap.matchMedia();
    animations.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.fromTo('#progressText', { y: 3, autoAlpha: 0.7 }, { y: 0, autoAlpha: 1, duration: 0.2, ease: 'power2.out', clearProps: 'transform,opacity,visibility' });
    }, shell);
    return () => animations.revert();
  }, [working, app.progress.message]);

  useEffect(() => {
    if (!app.error && !app.notice) return undefined;
    const animations = gsap.matchMedia();
    animations.add('(prefers-reduced-motion: no-preference)', () => {
      const messages = shell.current?.querySelectorAll('.app-message');
      if (messages?.length) gsap.fromTo(messages, { y: 7, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.24, stagger: 0.04, ease: 'power2.out', clearProps: 'transform,opacity,visibility' });
    }, shell);
    return () => animations.revert();
  }, [app.error, app.notice]);

  return (
    <main className="container" ref={shell}>
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark"><Icon name="layers" size={21} /></span>
          <h1>CloneCutter<span>Duplicate file manager</span></h1>
        </div>
        <button type="button" className={`connection-status${app.api.available ? ' connected' : ''}`} role="status" onClick={app.connectApi} disabled={app.api.checking || app.busy} title="Check local server status">
          <span className="status-dot" />
          {app.api.checking ? 'Connecting…' : app.api.available ? 'Local server connected' : 'Local server offline'}
        </button>
      </header>

      <section className="intro" aria-label="Welcome">
        <div>
          <p className="eyebrow"><span className="intro-eyebrow-dot" />Local file review</p>
          <h2>Find the copies.<br /><span>Keep what matters.</span></h2>
          <p className="intro-description">Review identical files, select what to remove, and move<br className="desktop-break" /> your selections to {app.trashName}.</p>
        </div>
        <div className="hero-art" aria-hidden="true">
          <span className="hero-orbit hero-orbit-outer" />
          <span className="hero-orbit hero-orbit-inner" />
          <div className="hero-file-stack"><Icon name="layers" size={49} /></div>
          <span className="hero-art-label">MATCH · REVIEW · KEEP</span>
        </div>
      </section>

      {app.error && <div className="app-message app-error" role="alert">{app.error}</div>}
      {app.notice && <div className="app-message app-notice" role="status">{app.notice}</div>}

      <section className="cleared-summary" aria-label="Deletion summary" role="status" aria-live="polite" aria-atomic="true">
        <div className="cleared-metric">
          <span className="cleared-icon"><Icon name="trash" size={19} /></span>
          <div>
            <p className="eyebrow">Moved to {app.trashName}</p>
            <p id="totalSpaceCleared" className="cleared-total">{formatBytes(app.cleared.bytes)}</p>
          </div>
        </div>
        <p className="cleared-files">{app.cleared.files.toLocaleString()} {app.cleared.files === 1 ? 'file' : 'files'} moved this session</p>
        <p className="cleared-note">Empty your {app.trashName} to reclaim disk space.</p>
      </section>

      <div className={`workspace-grid${working ? ' is-working' : ''}`}>
        {!working && <FolderControls app={app} />}
      </div>

      {working && (
        <section id="progressSection" className="progress-section" aria-label="Operation progress" aria-busy="true">
          <span className="progress-icon"><Icon name={app.phase === 'deleting' ? 'trash' : 'search'} size={23} /></span>
          <p className="eyebrow">{app.phase === 'deleting' ? 'Deleting selected copies' : 'Duplicate scan'}</p>
          <h3>{app.phase === 'deleting' ? `Moving files to ${app.trashName}` : 'Scanning for identical files'}</h3>
          <div className="progress-bar" role="progressbar" aria-label="Scan progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={app.progress.value}>
            <div id="progressFill" className="progress-fill" style={{ width: `${Math.max(0, Math.min(100, app.progress.value))}%` }} />
          </div>
          <div id="progressText" className="progress-text" role="status">{app.progress.message}</div>
          {app.phase === 'scanning' && <button className="btn-secondary cancel-scan" type="button" onClick={app.cancelScan} disabled={app.cancelling}>{app.cancelling ? 'Cancelling…' : 'Cancel scan'}</button>}
        </section>
      )}

      {app.scanSource && !working && <ScanResults app={app} />}

      <footer className="app-footer">
        <span><Icon name="shield" size={14} /> Checked on this computer</span>
        <span>Only selected files move to {app.trashName}.</span>
      </footer>
    </main>
  );
}
