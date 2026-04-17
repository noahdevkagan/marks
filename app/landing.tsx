import Link from "next/link";

const CWS_URL =
  "https://chromewebstore.google.com/detail/marks-bookmarks-ai-reader/aedfdmhchamdnnoocknkiiaeacbaffia";

export function Landing() {
  return (
    <div className="landing">
      <header className="landing-header">
        <div className="landing-brand">Marks</div>
        <nav className="landing-nav">
          <Link href="/login">Sign in</Link>
        </nav>
      </header>

      <main className="landing-main">
        <h1 className="landing-h1">
          Bookmarks, <span className="landing-accent">smarter</span>.
        </h1>
        <p className="landing-sub">
          Save any page in one click. AI tags it for you.
          Read offline. Sync Kindle highlights. The open Pocket alternative.
        </p>

        <div className="landing-cta">
          <a href={CWS_URL} className="btn-primary" target="_blank" rel="noreferrer">
            Install Chrome Extension
          </a>
          <Link href="/signup" className="btn-secondary">
            Sign up free
          </Link>
        </div>

        <div className="landing-hero" aria-hidden="true">
          <div className="hero-bar">
            <span className="hero-dot hero-r"></span>
            <span className="hero-dot hero-y"></span>
            <span className="hero-dot hero-g"></span>
            <span className="hero-url">getmarks.sh</span>
          </div>
          <div className="hero-app">
            <aside className="hero-sidebar">
              <div className="hero-brand">Mark<span>s</span></div>
              <div className="hero-sec">Library</div>
              <div className="hero-item hero-item-active">
                <span>All bookmarks</span><span>2,847</span>
              </div>
              <div className="hero-item"><span>Read later</span><span>142</span></div>
              <div className="hero-item"><span>Kindle highlights</span><span>1,204</span></div>
              <div className="hero-sec">Top tags</div>
              <div className="hero-item"><span><i className="hero-td" style={{background:"#0066cc"}}></i>ai</span><span>382</span></div>
              <div className="hero-item"><span><i className="hero-td" style={{background:"#e11d48"}}></i>startups</span><span>217</span></div>
              <div className="hero-item"><span><i className="hero-td" style={{background:"#16a34a"}}></i>design</span><span>189</span></div>
              <div className="hero-item"><span><i className="hero-td" style={{background:"#ca8a04"}}></i>writing</span><span>156</span></div>
            </aside>
            <section className="hero-main">
              <div className="hero-topbar">
                <div className="hero-search">🔍 Search 2,847 bookmarks and highlights…</div>
                <div className="hero-view"><span className="active">List</span><span>Grid</span></div>
              </div>
              <div className="hero-stats">
                <div><small>SAVED</small><strong>2,847</strong><em>+42 this week</em></div>
                <div><small>READ</small><strong>1,392</strong><em>49% of library</em></div>
                <div><small>TAGS</small><strong>186</strong><em>AI-suggested</em></div>
              </div>
              <div className="hero-bookmark">
                <div className="hero-fav" style={{background:"#ff5722"}}>N</div>
                <div>
                  <div className="hero-bm-title">How AI Agents Are Quietly Rewiring Knowledge Work</div>
                  <div className="hero-bm-meta">nytimes.com · saved 2 min ago · 8 min read</div>
                  <div className="hero-bm-tags">
                    <span>ai</span><span>productivity</span>
                    <span className="ai">✨ agents</span><span className="ai">✨ future-of-work</span>
                  </div>
                </div>
              </div>
              <div className="hero-bookmark">
                <div className="hero-fav" style={{background:"#1da1f2"}}>𝕏</div>
                <div>
                  <div className="hero-bm-title">Paul Graham on shipping vs. ideas</div>
                  <div className="hero-bm-meta">x.com/paulg · saved 1 hour ago</div>
                  <div className="hero-bm-tags">
                    <span>startups</span><span>founders</span><span>buildinpublic</span>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>

      <footer className="landing-footer">
        <span>no tracking · no ads · free</span>
        <div>
          <Link href="/privacy">Privacy</Link>
          <Link href="/support">Support</Link>
        </div>
      </footer>
    </div>
  );
}
