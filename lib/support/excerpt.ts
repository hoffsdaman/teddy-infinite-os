// Turns a raw inbound email body (plain text, often flattened from HTML with
// *bold* markers and <url> brackets) into something a board card can show:
// the sender's own words, without the quoted reply chain, the signature block
// or the legal disclaimer. The full original stays available in the ticket
// (SupportBoard renders it behind "Show full email"); this is only the preview.

const QUOTE_HEADER = /^On .{5,200}?wrote:\s*$/i;      // "On Fri, 28 Aug 2026 at 17:10, X wrote:"
const FORWARD_HEADER = /^-{2,}\s*(Original|Forwarded) Message\s*-{2,}$/i;
const SIG_SEPARATOR = /^--\s*$/;                       // RFC 3676 signature delimiter
const DISCLAIMER = /^(IMPORTANT|CONFIDENTIAL(ITY)?( NOTICE)?|DISCLAIMER|This (e-?mail|message)( and any attachments?)? (is|are) confidential|The contents of this (e-?mail|message))/i;
const BOLD_LINE = /^\*[^*\n]{1,80}\*\s*$/;             // a lone "*Daniel Hoffmann*" — start of a pasted signature
const IMAGE_TAG = /\[image:[^\]]*\]/gi;

export function cleanEmailBody(raw: string): string {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const kept: string[] = [];
  let sawBody = false;
  for (const line of lines) {
    const t = line.trim();
    if (QUOTE_HEADER.test(t) || FORWARD_HEADER.test(t) || SIG_SEPARATOR.test(t) || DISCLAIMER.test(t)) break;
    if (t.startsWith(">")) break;                      // quoted reply chain follows
    if (sawBody && BOLD_LINE.test(t)) break;           // signature block follows
    if (t) sawBody = true;
    kept.push(line);
  }
  return kept
    .join("\n")
    .replace(IMAGE_TAG, "")
    .replace(/<(https?:\/\/|mailto:)[^>\s]+>/g, "")    // "<http://…>" link artifacts
    .replace(/\*([^*\n]+)\*/g, "$1")                   // *bold* markers
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// One-paragraph excerpt for the card. `max` is a soft cap; the CSS line clamp
// does the visual truncation, this just keeps the DOM small on long emails.
export function emailExcerpt(raw: string, max = 320): string {
  const cleaned = cleanEmailBody(raw).replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  const cut = cleaned.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 40)) + "…";
}
