import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/t/', '/workflows/private/', '/board/', '/careers/'],
      },
    ],
    sitemap: 'https://teddy-infinite-os.vercel.app/sitemap.xml',
    host: 'https://teddy-infinite-os.vercel.app',
  }
}
