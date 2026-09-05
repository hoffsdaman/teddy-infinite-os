import type { SupportTicket } from "@/lib/support";

// A ticket that is open and untouched for this long "needs a reply". Support is
// measured in hours, not the 7-day AGING_DAYS the work boards use. Shared by the
// Support board (amber rail) and the dashboard (tile + queue).
export const AGING_HOURS = 24;

// Last thing that happened on the ticket: the newest comment, else its arrival.
export function lastActivityAt(t: SupportTicket): string {
  const last = t.comments[t.comments.length - 1];
  return last?.createdAt ?? t.createdAt;
}

export function isAging(t: SupportTicket, now = Date.now()): boolean {
  if (t.isResolved) return false;
  return now - new Date(lastActivityAt(t)).getTime() > AGING_HOURS * 3600_000;
}
