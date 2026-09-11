import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import './styles/tokens.css'
import './globals.css'
import './styles/site-components.css'
import './styles/utilities.css'
import SiteFrame from '@/components/SiteFrame'
import { getSiteOrigin } from '@/lib/site-origin'

export const metadata: Metadata = {
  // Social-image and canonical URLs resolve against THIS app, not the shop.
  metadataBase: new URL(getSiteOrigin()),
  title: { default: 'TeddyBed OS', template: '%s · TeddyBed OS' },
  description:
    "The single sign-in for everyone who runs Australia's premium kids bed & mattress brand.",
  openGraph: {
    title: 'TeddyBed OS',
    description:
      "The single sign-in for everyone who runs Australia's premium kids bed & mattress brand.",
    url: '/',
    siteName: 'TeddyBed OS',
    type: 'website',
    locale: 'en_AU',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TeddyBed OS',
    description:
      "The single sign-in for everyone who runs Australia's premium kids bed & mattress brand.",
  },
}

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'TeddyBed',
  alternateName: 'Teddy',
  url: 'https://teddybed.com.au',
  logo: 'https://teddybed.com.au/cdn/shop/files/Logo_2x_3ce71580-cc3a-460e-b130-aa3db2601951.png',
  description:
    "Australia's premium kids bed & mattress brand. Mattresses and bed bases designed by sleep specialists, backed by a 120-night sleep trial.",
  contactPoint: [
    {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: 'support@teddybed.com.au',
      telephone: '+61485855867',
      areaServed: ['AU'],
      availableLanguage: ['English'],
    },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <SiteFrame>{children}</SiteFrame>
        <Analytics />
      </body>
    </html>
  )
}
