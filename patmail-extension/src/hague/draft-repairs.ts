import { imageNumber,validateImages,type Filing } from './materials'
import type { DraftCheckpoint } from './draft-contract'

export function withDraftCorrections(checkpoint:DraftCheckpoint,filing?:Filing):DraftCheckpoint {
  return filing?.draftCorrections?.length?{...checkpoint,warnings:[...new Set([...(checkpoint.warnings??[]),...filing.draftCorrections])]}:checkpoint
}

/** User-approved draft correction; the original Word file is never modified. */
export function repairRepeatedDesignNumbers(filing:Filing,images:File[]):Filing|null {
  const rows=filing.products
  if(rows.length<2||!rows.every(r=>r[0]==='1'&&r[2]===rows[0][2]&&r[3]===rows[0][3]))return null
  const prefixes=new Set(images.map(f=>imageNumber(f).split('.')[0]))
  if(prefixes.size!==rows.length||rows.some((r,i)=>!prefixes.has(String(i+1))||images.filter(f=>imageNumber(f).split('.')[0]===String(i+1)).length!==Number(r[1])))return null
  const note=`原 Word 产品表设计编号全部为 1；经用户确认，草稿按产品表行顺序及图纸分组修正为 1–${rows.length}，请核对。`
  const repaired={...filing,products:rows.map((r,i)=>[String(i+1),...r.slice(1)]),draftCorrections:[...new Set([...(filing.draftCorrections??[]),note])]}
  return validateImages(repaired,images).length?null:repaired
}
