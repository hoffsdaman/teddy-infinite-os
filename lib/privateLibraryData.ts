// The upstream private library data is excluded from this public snapshot by
// the allowlist sync (see README "Provenance and limits"). Only counts derived
// from it are ever exposed; with no items the workflow totals simply omit the
// private-library contribution.
export type PrivateLibraryItem = {
  category: string
  href: string
}

export const allPrivateItems: PrivateLibraryItem[] = []
