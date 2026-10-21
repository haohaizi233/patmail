import type { FileSearchFormField } from '../shared/message'

export const FILING_FORM_FIELDS: readonly string[]

export function scanFilingForm(doc?: Document): { page: string; fields: FileSearchFormField[] }

export function waitFilingFormOptions(doc?: Document, timeoutMs?: number): Promise<number>
