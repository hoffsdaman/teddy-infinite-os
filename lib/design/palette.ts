// Brand palette for renderers that cannot read CSS custom properties:
// Open Graph images (Satori), QR codes, and HTML email sent to external
// inboxes. Everything rendered in the browser must use the tokens in
// app/styles/tokens.css instead. palette.json is the source (so the CommonJS
// OG renderer can require it) and mirrors §1 of tokens.css; keep them in
// sync by hand. `npm run check:tokens` allows raw colours only there.
import palette from "./palette.json";
export const PALETTE = palette as Readonly<typeof palette>;
export type PaletteKey = keyof typeof palette;
