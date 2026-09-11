import './careers.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Careers at TeddyBed',
  description:
    "Join the team behind Australia's premium kids bed and mattress brand. Open roles across support, operations and marketing.",
  openGraph: {
    title: 'Careers at TeddyBed',
    description: "Join the team behind Australia's premium kids bed and mattress brand.",
    url: '/careers/',
    type: 'website',
  },
}

export default function CareersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}