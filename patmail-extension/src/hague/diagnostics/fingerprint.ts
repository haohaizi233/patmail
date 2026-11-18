import { safeComponentId, stableHash } from './schema.mjs'

const actionKinds = new Set(['PrimeFaces.ab', 'mojarra.ab', 'jsf.ajax.request', 'mojarra.jsfcljs', 'remoteCommand', 'widget', 'FileUpload', 'DataTable'])
const keys = ['forms', 'components', 'actions', 'updates'] as const
export type ProtocolStructure = Partial<Record<typeof keys[number], string[]>>
export function fingerprintProtocol(input: ProtocolStructure) {
  const structure = { forms: [] as string[], components: [] as string[], actions: [] as string[], updates: [] as string[] }
  for (const key of keys) structure[key] = [...new Set((input[key] ?? []).slice(0, 1000).map(v => key === 'actions' ? (actionKinds.has(v) ? v : 'unresolved') : safeComponentId(v)).filter((v): v is string => typeof v === 'string'))].sort()
  return { version: 1 as const, ...structure, hash: stableHash(JSON.stringify(structure)) }
}
export function diffFingerprints(before: ReturnType<typeof fingerprintProtocol>, after: ReturnType<typeof fingerprintProtocol>) {
  const added = {} as Record<typeof keys[number], string[]>
  const removed = {} as typeof added
  for (const key of keys) { added[key] = after[key].filter(v => !before[key].includes(v)); removed[key] = before[key].filter(v => !after[key].includes(v)) }
  return { compatible: before.version === after.version, changed: before.hash !== after.hash, added, removed }
}
