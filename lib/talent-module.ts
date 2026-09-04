// Talent Module — the public careers pages (/careers, /careers/[slug],
// /careers/[slug]/apply) and the application API. The code is kept and working
// but hidden from the public UI at the client's request, so the module can be
// switched on later without rebuilding it. While this is false the public
// routes return 404, they carry no nav/footer links, and they are excluded from
// the sitemap and disallowed in robots.txt. The admin ATS (talent → jobs) is
// unaffected and keeps running internally.
//
// To re-enable: give the careers pages current (non-placeholder) copy, set this
// to true, add the links/sitemap entries back, and drop /careers from robots.
export const CAREERS_PUBLIC = false;
