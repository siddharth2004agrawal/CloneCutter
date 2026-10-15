import useCloneCutter from './hooks/useCloneCutter.js';
import { gsap } from 'gsap';
import { useEffect, useRef } from 'react';
import FolderControls from './components/FolderControls.jsx';
import ScanResults from './components/ScanResults.jsx';
import Icon from './components/Icon.jsx';
import LandingHero from './components/LandingHero.jsx';
import { formatBytes } from './lib/files.js';
import { formatDuration, formatRemainingTime } from './lib/scanTime.js';

export default function App() {
  const shell = useRef(null);
  const app = useCloneCutter();
  const working = app.phase === 'scanning' || app.phase === 'deleting';

  useEffect(() => {
    const animations = gsap.matchMedia();
    animations.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.timeline({ defaults: { duration: 0.55, ease: 'power2.out' } })
        .from('.app-header', { y: -10, autoAlpha: 0 })
        .from('.hero-copy > *', { y: 18, autoAlpha: 0, stagger: 0.09 }, '-=0.28')
        .from('.hero-preview', { y: 20, rotate: 2, autoAlpha: 0, duration: 0.7 }, '-=0.55')
        .from('.workflow-step', { y: 10, autoAlpha: 0, stagger: 0.08 }, '-=0.35')
        .from('.upload-section', { y: 15, autoAlpha: 0 }, '-=0.3');
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
        <nav className="header-nav" aria-label="Main navigation">
          <a href="#how-it-works" className="nav-link">How it works</a>
          <a href={working ? '#progressSection' : '#scan-setup'} className="btn-primary">{working ? 'View progress' : 'Find duplicates'}<Icon name="arrow" size={15} /></a>
        </nav>
      </header>

      <LandingHero trashName={app.trashName} working={working} />

      <section id="how-it-works" className="workflow" aria-label="How it works">
        <div className="workflow-intro"><p className="eyebrow">A little order, in three steps</p><h2>Less clutter.<br />More breathing room.</h2></div>
        <ol className="workflow-steps">
          <li className="workflow-step"><span className="step-number">01</span><div><h3>Find your matches</h3><p>Choose a few folders or your entire computer. We compare file contents to find identical copies.</p></div></li>
          <li className="workflow-step"><span className="step-number">02</span><div><h3>You make the call</h3><p>Review each match and choose what goes. At least one copy in every group stays.</p></div></li>
          <li className="workflow-step"><span className="step-number">03</span><div><h3>Make a little space</h3><p>Move selected copies to {app.trashName}. You can restore them until you empty it.</p></div></li>
        </ol>
      </section>

      {app.error && <div className="app-message app-error" role="alert">{app.error}</div>}
      {app.notice && <div className="app-message app-notice" role="status">{app.notice}</div>}

      {app.cleared.files > 0 && <section className="cleared-summary" aria-label="Deletion summary" role="status" aria-live="polite" aria-atomic="true">
        <div className="cleared-metric">
          <span className="cleared-icon"><Icon name="trash" size={19} /></span>
          <div>
            <p className="eyebrow">Moved to {app.trashName}</p>
            <p id="totalSpaceCleared" className="cleared-total">{formatBytes(app.cleared.bytes)}</p>
          </div>
        </div>
        <p className="cleared-files">{app.cleared.files.toLocaleString()} {app.cleared.files === 1 ? 'file' : 'files'} moved this session</p>
        <p className="cleared-note">Empty your {app.trashName} to reclaim disk space.</p>
      </section>}

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
          {app.phase === 'scanning' && <div className="scan-timing">
            <span>Elapsed: <strong>{formatDuration(app.progress.elapsedSeconds)}</strong></span>
            <span>Estimated time remaining: <strong>{app.cancelling ? 'Cancelling…' : formatRemainingTime(app.progress.remainingSeconds)}</strong></span>
          </div>}
          {app.phase === 'scanning' && <button className="btn-secondary cancel-scan" type="button" onClick={app.cancelScan} disabled={app.cancelling}>{app.cancelling ? 'Cancelling…' : 'Cancel scan'}</button>}
        </section>
      )}

      {app.scanSource && !working && <ScanResults app={app} />}

      <footer className="app-footer">
        <span className="footer-brand"><Icon name="layers" size={17} />CloneCutter<span>A little space goes a long way.</span></span>
        <span><Icon name="shield" size={14} />Your files. Your decisions.</span>
      </footer>
    </main>
  );
}
