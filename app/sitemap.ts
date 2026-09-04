import type { MetadataRoute } from 'next'
import { allWorkflows } from '@/lib/workflowsData'
import { getAllPublishedPosts } from '@/lib/blog'

const BASE = 'https://teddy-infinite-os.vercel.app'

// Site uses trailingSlash: true in next.config.mjs, so every canonical URL
// must end in '/'. Without this, Google does a 308 hop on every URL and
// burns crawl budget.

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const staticRoutes: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
    { path: '/', priority: 1.0, changeFrequency: 'weekly' },
    { path: '/blog/', priority: 0.8, changeFrequency: 'daily' },
    { path: '/workflows/', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/workflows/method/', priority: 0.7, changeFrequency: 'monthly' },
    { path: '/legal/privacy/', priority: 0.3, changeFrequency: 'yearly' },
    { path: '/legal/eula/', priority: 0.3, changeFrequency: 'yearly' },
  ]

  const staticEntries: MetadataRoute.Sitemap = staticRoutes.map(({ path, priority, changeFrequency }) => ({
    url: `${BASE}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }))

  // Static + DB-published posts. getAllPublishedPosts degrades to static-only on
  // a DB read failure, so the sitemap never fails the build.
  const postEntries: MetadataRoute.Sitemap = (await getAllPublishedPosts()).map((p) => ({
    url: `${BASE}/post/${p.slug}/`,
    lastModified: p.date ? new Date(p.date) : now,
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  const workflowEntries: MetadataRoute.Sitemap = allWorkflows.map((w) => ({
    url: `${BASE}/workflows/${w.slug}/`,
    lastModified: new Date(w.date),
    changeFrequency: 'monthly',
    priority: 0.6,
  }))

  // Postings live in the ATS, so this list changes without a deploy.

  return [...staticEntries, ...postEntries, ...workflowEntries]
}
