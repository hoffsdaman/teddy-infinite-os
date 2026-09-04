import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import './styles/tokens.css'
import './globals.css'
import './styles/utilities.css'
import SiteFrame from '@/components/SiteFrame'

export const metadata: Metadata = {
  metadataBase: new URL('https://teddybed.com.au'),
  title: 'TeddyBed OS',
  description:
    "The single sign-in for everyone who runs Australia's premium kids bed & mattress brand.",
  openGraph: {
    title: 'TeddyBed OS',
    description:
      "The single sign-in for everyone who runs Australia's premium kids bed & mattress brand.",
    url: 'https://teddybed.com.au',
    siteName: 'TeddyBed OS',
    type: 'website',
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
  logo: 'https://teddybed.com.au/logo.png',
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
