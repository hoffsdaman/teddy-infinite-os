import './careers.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Careers at TeddyBed OS | Join the AI Frontier',
  description:
    'Help founders lead AI. TeddyBed OS is looking for strategists, builders, and thinkers who want to work at the frontier of AI adoption in business.',
  openGraph: {
    title: 'Careers at TeddyBed OS | Join the AI Frontier',
    description:
      'Help founders lead AI. Work at the frontier of AI adoption in business.',
  },
}

export default function CareersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}