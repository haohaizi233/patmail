import type {TraceEvent} from './trace'
export function sanitizeTraceEvent(raw:unknown):TraceEvent|null
export function stableHash(value:unknown):string
export function safeComponentId(value:unknown):string
export function safePath(value:unknown):string|undefined
