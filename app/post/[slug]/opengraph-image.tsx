// @ts-nocheck
import { renderCardDef, OG_SIZE } from '@/lib/ogRender'
import { getUnifiedPostBySlug } from '@/lib/blog'

export const runtime = 'nodejs'
export const size = OG_SIZE
export const contentType = 'image/png'
export const alt = 'TeddyBed OS Blog'

// Without this file every post shared the root layout's generic site card:
// Next's file-based OG images override the config-based images set in
// generateMetadata, so the per-post og:image never applied. Rendering a
// branded typographic card per post fixes share previews for the whole blog.
export default async function Image({ params }: { params: { slug: string } }) {
  const post = await getUnifiedPostBySlug(params.slug).catch(() => null)
  const title = post?.title || 'TeddyBed OS Blog'
  const words = title.split(' ')
  const mid = Math.ceil(words.length / 2)
  const lines =
    words.length > 3
      ? [{ t: words.slice(0, mid).join(' ') }, { t: words.slice(mid).join(' '), accent: true }]
      : [{ t: title, accent: true }]
  return renderCardDef({
    eyebrow: post?.category ? `TeddyBed OS Blog · ${post.category}` : 'TeddyBed OS Blog',
    lines,
    photo: null,
    size: title.length > 44 ? 54 : 64,
    alt: `${title} · TeddyBed OS`,
  })
}
