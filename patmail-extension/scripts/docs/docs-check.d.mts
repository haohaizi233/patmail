export interface DocumentMetadata {
  path: string
  title: string
  status: string
  scope: string
  last_verified_commit: string
  last_reviewed: string
  evidence_level: string
  display?: boolean
  related_sources?: string[]
  canonical_path?: string
}
export function inspectMarkdown(base: string, file: string, strictAnchors?: boolean): string[]
export function checkCatalog(
  base: string,
  catalog: {
    documents: DocumentMetadata[]
    migrations?: { old_path: string; canonical_path: string }[]
  },
): string[]
export function check(options?: { writeBaseline?: boolean }): {
  errors: string[]
  legacyIssues: number
  grandfathered: number
}
