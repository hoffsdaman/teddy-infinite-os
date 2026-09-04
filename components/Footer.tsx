import Link from 'next/link'

export default function Footer() {
  return (
    <footer>
      <div className="container">
        <div className="footer-top">
          <div>
            <div className="footer-logo">
              <span
                className="site-wordmark site-wordmark--on-dark"
              >
                TeddyBed
              </span>
            </div>
            <p className="footer-desc">
              Australia&rsquo;s premium kids bed &amp; mattress brand. Mattresses and bed bases designed by sleep specialists, backed by a 120-night sleep trial.
            </p>
            <div className="footer-social">
              <a href="https://teddybed.com.au" target="_blank" rel="noopener noreferrer">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                teddybed.com.au
              </a>
            </div>
          </div>

          <div>
            <div className="footer-col-title">Company</div>
            <div className="footer-links">
              <Link href="/blog">Blog</Link>
              <Link href="/workflows">Workflows</Link>
              <Link href="/careers">Careers</Link>
            </div>
          </div>

          <div>
            <div className="footer-col-title">Contact</div>
            <div className="footer-contact">
              <div className="footer-contact-item">
                <div className="footer-contact-icon">
                  <svg viewBox="0 0 24 24">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                </div>
                <a href="mailto:support@teddybed.com.au">support@teddybed.com.au</a>
              </div>
              <div className="footer-contact-item">
                <div className="footer-contact-icon">
                  <svg viewBox="0 0 24 24">
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012.18 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 8.16a16 16 0 006.93 6.93l1.52-1.52a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                  </svg>
                </div>
                <div>
                  <div>0485 855 867</div>
                  <div>2A/149 McCredie Rd, Smithfield NSW 2164</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <div className="footer-copy">© 2026 TeddyBed AU, Smithfield NSW. All rights reserved.</div>
          <div className="footer-bottom-links">
            <Link href="/legal/privacy">Privacy Policy</Link>
            <Link href="/legal/eula">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
