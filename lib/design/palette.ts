// Brand palette for renderers that cannot read CSS custom properties:
// Open Graph images (Satori), QR codes, and HTML email sent to external
// inboxes. Everything rendered in the browser must use the tokens in
// app/styles/tokens.css instead — this file mirrors §1 of that file and
// must be kept in sync with it. `npm run check:tokens` allows raw colours
// only there and here.
export const PALETTE = {
  dark: "#18404B",       // --teddy-yogi
  blue: "#18404B",       // teal carries the interactive role; no blue in-brand
  blueHover: "#123138",  // --teddy-yogi-hover
  blueBright: "#2E6373",
  mint: "#F6B327",       // --teddy-winnie carries the bright-accent role
  mintBright: "#F6B327",
  booboo: "#D8A476",
  sand: "#EDDCC7",
  polar: "#F4EFE9",
  white: "#FFFFFF",
  canvas: "#F5F6F8",
  line: "#E7DFD2",
  inkBody: "#5C6A6E",
  muted: "#9CA3AF",
  greyMid: "#6B7280",
} as const;
