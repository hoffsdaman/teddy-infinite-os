import './blog.css'
import type { Metadata } from 'next'

const title = 'Blog | TeddyBed'
const description = 'Sleep advice, product news and stories from TeddyBed, Australia\'s premium kids bed and mattress brand.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/blog/' },
  openGraph: { title, description, url: '/blog/', type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}