import type { Metadata } from 'next'
import Link from 'next/link'
import './home.css'

export const metadata: Metadata = {
  title: 'TeddyBed OS',
  description:
    "The single sign-in for everyone who runs Australia's premium kids bed & mattress brand.",
}

const consoles = [
  {
    title: 'Admin Console',
    tag: 'Run the brand.',
    body: 'Orders, inventory, revenue, marketing and reporting for the whole business — from mattresses to bed bases.',
    href: '/admin/login',
    cta: 'Sign in to Admin',
    primary: true,
    note: 'Staff access only.',
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </svg>
    ),
  },
  {
    title: 'Team Workspace',
    tag: 'For the TeddyBed team.',
    body: 'Assignments, customer queries and the day-to-day tools for support, warehouse and marketing.',
    href: '/team',
    cta: 'Open workspace',
    primary: false,
    note: 'Requires a team invitation.',
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    title: 'Client Portal',
    tag: 'For TeddyBed partners.',
    body: 'Engagements, orders, deliverables and reports for retail and wholesale partners.',
    href: '/portal',
    cta: 'Open portal',
    primary: false,
    note: (
      <>
        New partner? <a href="mailto:support@teddybed.com.au">Talk to TeddyBed</a>
      </>
    ),
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <path d="M3.3 7l8.7 5 8.7-5" />
        <path d="M12 22V12" />
      </svg>
    ),
  },
]

const pillars = [
  {
    num: '01',
    title: '120-Night Sleep Trial',
    body: 'Every mattress is backed by a full sleep-trial promise, so families can buy with confidence — from ages 2 to 18.',
  },
  {
    num: '02',
    title: 'Designed by Sleep Specialists',
    body: 'CertiPUR-US certified foams, made without harmful chemicals. Junior, Junior Lux & Junior Elite mattresses; TeddyDen, Monti & iBase bases.',
  },
  {
    num: '03',
    title: 'Sustainability Built In',
    body: 'Every order removes plastic bottles from the environment and plants native trees across Australia.',
  },
]

export default function HomePage() {
  return (
    <div className="os-home">
      <nav className="os-nav">
        <div className="os-wordmark">
          <span className="os-wordmark-text">TeddyBed</span>
          <span className="os-wordmark-chip">OS</span>
        </div>
        <div className="os-nav-links">
          <a href="#consoles">Consoles</a>
          <a href="#about">About TeddyBed</a>
          <a className="os-nav-external" href="https://teddybed.com.au" target="_blank" rel="noopener noreferrer">
            teddybed.com.au
          </a>
          <Link className="os-btn os-btn-primary" href="/admin/login">
            Sign in
          </Link>
        </div>
      </nav>

      <header className="os-hero">
        <span className="os-badge">Company OS</span>
        <h1>We invest in sleep so you can invest in life.</h1>
        <p>The single sign-in for everyone who runs Australia&rsquo;s premium kids bed &amp; mattress brand.</p>
      </header>

      <section className="os-consoles" id="consoles">
        <div className="os-section-head">
          <span className="os-eyebrow">Consoles</span>
          <h2>One front door. Three ways in.</h2>
        </div>
        <div className="os-console-grid">
          {consoles.map((c) => (
            <div className="os-console-card" key={c.title}>
              {c.icon}
              <h3>{c.title}</h3>
              <p className="os-console-tag">{c.tag}</p>
              <p>{c.body}</p>
              <div className="os-console-actions">
                <Link className={`os-btn ${c.primary ? 'os-btn-primary' : 'os-btn-secondary'}`} href={c.href}>
                  {c.cta}
                </Link>
                <span className="os-console-note">{c.note}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="os-unique" id="about">
        <div className="os-section-head">
          <span className="os-eyebrow">What Makes TeddyBed Unique</span>
          <h2>All we do is kids&rsquo; sleep &mdash; and we&rsquo;re really good at it.</h2>
        </div>
        <div className="os-unique-grid">
          {pillars.map((p) => (
            <div className="os-unique-item" key={p.num}>
              <span className="os-unique-num">{p.num}</span>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="os-newsletter">
        <div>
          <h2>Expert sleep advice for growing families.</h2>
          <p>Practical tips and product news &mdash; free from the TeddyBed sleep specialists.</p>
        </div>
        <div className="os-newsletter-form">
          <a className="os-btn os-btn-primary" href="mailto:support@teddybed.com.au?subject=Newsletter%20signup">
            Subscribe
          </a>
        </div>
      </section>

      <footer className="os-footer">
        <div className="os-footer-cols">
          <div className="os-footer-col">
            <div className="os-wordmark">
              <span className="os-wordmark-text" style={{ color: '#ffffff', fontSize: 20 }}>
                TeddyBed
              </span>
              <span className="os-wordmark-chip" style={{ fontSize: 11 }}>
                OS
              </span>
            </div>
            <p className="os-footer-blurb">
              Australia&rsquo;s Premium Kids Bed &amp; Mattress Brand. Internal operations platform.
            </p>
          </div>
          <div className="os-footer-col">
            <span className="os-footer-heading">Contact</span>
            <a href="mailto:support@teddybed.com.au">support@teddybed.com.au</a>
            <span>0485 855 867</span>
            <span>2A/149 McCredie Rd, Smithfield NSW 2164</span>
            <span className="os-footer-muted">Mon&ndash;Fri, 9am&ndash;5pm AEDT</span>
          </div>
          <div className="os-footer-col">
            <span className="os-footer-heading">Links</span>
            <a href="https://teddybed.com.au" target="_blank" rel="noopener noreferrer">
              Public site
            </a>
            <a href="#about">About TeddyBed</a>
            <Link href="/admin/login">Sign in</Link>
          </div>
        </div>
        <div className="os-footer-bottom">
          <span>&copy; {new Date().getFullYear()} TeddyBed AU, Smithfield NSW. All rights reserved.</span>
          <span>Team access only &mdash; not a public storefront.</span>
        </div>
      </footer>
    </div>
  )
}
