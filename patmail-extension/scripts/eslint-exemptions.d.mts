export interface ExemptionLintResult {
  filePath: string
  suppressedMessages?: Array<{
    ruleId: string | null
    message: string
    severity: number
    line: number
    suppressions?: Array<{ kind: string; justification: string }>
  }>
}
export function collectExemptions(
  files: readonly ExemptionLintResult[],
  root: string,
  readSource?: (path: string) => string,
): string[]
export function compareExemptions(current: readonly string[], baseline: unknown): string[]
