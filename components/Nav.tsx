'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

// Slim nav for the surviving public pages (blog, workflows, careers, events).
// The Edge8 marketing dropdowns and retreat-funnel CTA logic went with the
// marketing pages; the CTA now feeds the OS sign-in. The wordmark is set in
// Roca Two (--font-display) rather than a logo image, matching the homepage.
export default function Nav() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const toggleMenu = () => setMenuOpen((v) => !v)

  const hamburgerStyle = (i: number) => {
    if (!menuOpen) return {}
    if (i === 0) return { transform: 'rotate(45deg) translate(5px, 5px)' }
    if (i === 1) return { opacity: 0 }
    return { transform: 'rotate(-45deg) translate(5px, -5px)' }
  }

  return (
    <>
      <nav
        id="navbar"
        style={{ background: scrolled ? 'rgba(255,255,255,0.99)' : 'rgba(255,255,255,0.97)' }}
      >
        <div className="container">
          <div className="nav-inner">
            <Link href="/" className="nav-logo" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '24px',
                  fontWeight: 400,
                  color: 'var(--dark)',
                  letterSpacing: '-0.5px',
                }}
              >
                TeddyBed
              </span>
              <span
                style={{
                  background: 'var(--mint)',
                  color: 'var(--dark)',
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '3px 7px',
                  borderRadius: '40px',
                  letterSpacing: '0.5px',
                  textTransform: 'uppercase',
                }}
              >
                OS
              </span>
            </Link>

            <ul className="nav-links">
              <li><Link href="/blog">Blog</Link></li>
              <li><Link href="/workflows">Workflows</Link></li>
              <li><Link href="/careers">Careers</Link></li>
            </ul>

            <Link href="/admin/login" className="btn btn-primary nav-cta">
              Sign in
            </Link>

            <button
              className="nav-hamburger"
              id="hamburger"
              aria-label="Menu"
              onClick={toggleMenu}
            >
              <span style={hamburgerStyle(0)} />
              <span style={hamburgerStyle(1)} />
              <span style={hamburgerStyle(2)} />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Menu */}
      <div className={`mobile-menu${menuOpen ? ' open' : ''}`} id="mobileMenu">
        <Link href="/blog" onClick={() => setMenuOpen(false)}>Blog</Link>
        <Link href="/workflows" onClick={() => setMenuOpen(false)}>Workflows</Link>
        <Link href="/careers" onClick={() => setMenuOpen(false)}>Careers</Link>
        <Link href="/admin/login" className="btn btn-primary" onClick={() => setMenuOpen(false)}>
          Sign in
        </Link>
      </div>
    </>
  )
}
