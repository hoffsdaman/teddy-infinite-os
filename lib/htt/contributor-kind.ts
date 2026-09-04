/**
 * Owner-vs-TeddyBed OS contribution classification (read-time). Ported from the
 * Human Token Tracker (lib/data/contributor-kind.ts): project_id -> repo_id.
 *
 * The owner/client is identified by `htt.client_identities` (github_login,
 * optionally repo-scoped; repo_id null = global). Pull requests carry
 * `author_login`, so we classify a PR's author by matching its login against
 * the owner set.
 */

export type ContributorKind = "owner" | "edge8";

/** Subset of a `htt.client_identities` row used for classification. */
export interface ClientIdentityRow {
  repo_id: string | null; // null = applies to every repo for the client
  github_login: string | null;
  git_email: string | null;
}

export interface PrLike {
  author_login: string | null;
}

/**
 * Lowercased github_logins that mark the OWNER for `repoId`: global rows
 * (`repo_id === null`) plus rows scoped to this repo.
 */
export function buildOwnerLoginSet(identities: ClientIdentityRow[], repoId: string): Set<string> {
  const set = new Set<string>();
  for (const id of identities) {
    if (id.repo_id !== null && id.repo_id !== repoId) continue;
    if (id.github_login) set.add(id.github_login.toLowerCase());
  }
  return set;
}

/**
 * Lowercased owner git_emails for `repoId` (global rows + this repo's rows).
 * Used to classify self-reported effort_log entries, which carry
 * `contributor_email` (not a github_login).
 */
export function buildOwnerEmailSet(identities: ClientIdentityRow[], repoId: string): Set<string> {
  const set = new Set<string>();
  for (const id of identities) {
    if (id.repo_id !== null && id.repo_id !== repoId) continue;
    if (id.git_email) set.add(id.git_email.toLowerCase());
  }
  return set;
}

/** True if an email belongs to the owner/client (case-insensitive). */
export function isOwnerEmail(email: string | null, ownerEmails: Set<string>): boolean {
  return !!email && ownerEmails.has(email.toLowerCase());
}

/** Classify a PR author by login: owner if its (lowercased) login is in the owner set. */
export function classifyPrAuthor(login: string | null, ownerLogins: Set<string>): ContributorKind {
  if (login && ownerLogins.has(login.toLowerCase())) return "owner";
  return "edge8";
}

/** Count PRs split into owner vs edge8 buckets. */
export function splitPrCountsByKind(
  prs: PrLike[],
  ownerLogins: Set<string>,
): { owner: number; edge8: number } {
  let owner = 0;
  let edge8 = 0;
  for (const pr of prs) {
    if (classifyPrAuthor(pr.author_login, ownerLogins) === "owner") owner++;
    else edge8++;
  }
  return { owner, edge8 };
}
