import type { HagueRow } from './workflow'
import { confirmDialog } from '../app/dialog'
import { draftWarnings } from './draft-contract'

export function draftReviewNotes(row:HagueRow,error?:string):string[] {
  return [...new Set([...draftWarnings(row.filing?.draftCorrections),...draftWarnings(row.decision?.warnings),...draftWarnings(row.draft?.warnings),...(row.draft?.error?[row.draft.error]:[]),...(error?[error]:[])])].map(note=>`${row.folder.caseVolume}：${note}`)
}

/** Use the workspace dialog for completion and review notes; Vue renders all content as text. */
export function showDraftCompletion(message:string,notes:string[]):Promise<boolean> {
  return confirmDialog({
    title: '草稿处理完成',
    message,
    confirmLabel: '我知道了',
    cancelLabel: '',
    ...(notes.length ? { table: { headers: ['递交前请核对'], rows: [...new Set(notes)].map(note => [note]) } } : {})
  })
}
