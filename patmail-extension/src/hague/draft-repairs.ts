import { imageNumber,validateImages,type Filing } from './materials'
import type { DraftCheckpoint } from './draft-contract'

export function withDraftCorrections(checkpoint:DraftCheckpoint,filing?:Filing):DraftCheckpoint {
  return filing?.draftCorrections?.length?{...checkpoint,...(filing.designNumberCorrection?{designNumberCorrection:{...filing.designNumberCorrection}}:{}),warnings:[...new Set([...(checkpoint.warnings??[]),...filing.draftCorrections])]}:checkpoint
}

/** User-approved draft correction; the original Word file is never modified. */
export function repairRepeatedDesignNumbers(filing:Filing,images:File[]):Filing|null {
  const rows=filing.products
  if(rows.length<2||!rows.every(r=>r[0]==='1'&&r[2]===rows[0][2]&&r[3]===rows[0][3]))return null
  const prefixes=new Set(images.map(f=>imageNumber(f).split('.')[0]))
  if(prefixes.size!==rows.length||rows.some((r,i)=>!prefixes.has(String(i+1))||images.filter(f=>imageNumber(f).split('.')[0]===String(i+1)).length!==Number(r[1])))return null
  const note=`原 Word 产品表设计编号全部为 1；经用户确认，草稿按产品表行顺序及图纸分组修正为 1–${rows.length}，请核对。`
  const repaired={...filing,designNumberCorrection:{inputKey:designCorrectionInputKey(filing,images),note},products:rows.map((r,i)=>[String(i+1),...r.slice(1)]),draftCorrections:[...new Set([...(filing.draftCorrections??[]),note])]}
  return validateImages(repaired,images).length?null:repaired
}

/** Consistency fingerprint for this correction, including the source fields and image metadata. */
export function designCorrectionInputKey(filing:Filing,images:File[]):string {
  const body=JSON.stringify({locarno:filing.locarno,products:filing.products.map(p=>[...p]),description:filing.description,views:filing.views.map(v=>[v.number,v.code,v.label]),images:images.map(f=>[f.name,f.size,f.lastModified]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]),'en',{numeric:true}))})
  let hash=2166136261
  for(let i=0;i<body.length;i++)hash=Math.imul(hash^body.charCodeAt(i),16777619)
  return `${body.length}-${(hash>>>0).toString(16)}`
}
/** Reapply only an explicit approval tied to the same correction input; legacy notes require explicit migration. */
export function restoreApprovedDesignNumbers(filing:Filing,images:File[],checkpoint?:DraftCheckpoint):Filing {
  const approval=checkpoint?.designNumberCorrection
  if(!approval||approval.inputKey!==designCorrectionInputKey(filing,images))return filing
  const repaired=repairRepeatedDesignNumbers(filing,images)
  return repaired?.designNumberCorrection?.note===approval.note?repaired:filing
}
