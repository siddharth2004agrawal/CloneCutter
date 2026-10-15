import Icon from './Icon.jsx';

export default function LandingHero({ trashName, working }) {
  return (
    <section className="intro" aria-labelledby="welcome-title">
      <div className="hero-copy">
        <p className="eyebrow hero-eyebrow"><span />A fresh start for your files</p>
        <h2 id="welcome-title">Keep the memories.<br /><em>Lose the copies.</em></h2>
        <p className="intro-description">Same photo. Three folders. Sound familiar? Find identical files, keep your favorites, and give your drive a little breathing room.</p>
        <div className="hero-actions">
          <a href={working ? '#progressSection' : '#scan-setup'} className="btn-primary hero-cta">{working ? 'View progress' : 'Find my duplicates'}<Icon name="arrow" size={18} /></a>
          <a href="#how-it-works" className="hero-secondary">See how it works<Icon name="chevron" size={15} /></a>
        </div>
        <p className="hero-reassurance"><Icon name="shield" size={16} />Nothing moves to {trashName} without your say.</p>
      </div>

      <figure className="hero-preview" aria-label="Example showing three identical photos and one copy to keep">
        <span className="preview-doodle preview-doodle-one" aria-hidden="true">✳</span>
        <div className="preview-back-card preview-back-one" aria-hidden="true"><Icon name="image" size={28} /></div>
        <div className="preview-back-card preview-back-two" aria-hidden="true"><Icon name="file" size={28} /></div>
        <div className="preview-window">
          <div className="preview-topbar"><span className="preview-window-dots" aria-hidden="true"><i /><i /><i /></span><span>A clearer view</span><Icon name="layers" size={14} /></div>
          <div className="preview-content">
            <div className="preview-heading"><span className="preview-match-icon"><Icon name="check" size={16} /></span><div><strong>One memory. Three copies.</strong><span>Identical content, different places.</span></div></div>
            <div className="preview-file is-kept"><span className="preview-photo" aria-hidden="true"><span /></span><div className="preview-file-info"><strong>weekend-away.jpg</strong><span>Pictures / Favorites</span></div><span className="preview-file-tag"><Icon name="check" size={12} />Keep</span></div>
            <div className="preview-file"><span className="preview-photo" aria-hidden="true"><span /></span><div className="preview-file-info"><strong>weekend-away (1).jpg</strong><span>Downloads</span></div><span className="preview-file-tag is-copy">Copy</span></div>
            <div className="preview-file"><span className="preview-photo" aria-hidden="true"><span /></span><div className="preview-file-info"><strong>weekend-away-copy.jpg</strong><span>Desktop / Backup</span></div><span className="preview-file-tag is-copy">Copy</span></div>
            <div className="preview-bottom"><Icon name="shield" size={14} /><span>The good stuff stays.</span><span className="preview-checks" aria-hidden="true"><Icon name="check" size={13} /><Icon name="check" size={13} /></span></div>
          </div>
        </div>
        <div className="preview-note"><span aria-hidden="true">↳</span> A little less “copy of copy”.</div>
        <figcaption>Illustrative preview · Your results appear after a scan</figcaption>
      </figure>
    </section>
  );
}
