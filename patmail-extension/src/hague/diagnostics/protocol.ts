import type {StructureSnapshot, TraceEvent} from './trace'

/** Counts and component identities only. Never include text, field values or row identifiers. */
export function structuralSnapshot(doc:Document|DocumentFragment,path:string,referenceConfirmed:boolean):StructureSnapshot {
 const count=(selector:string)=>doc.querySelectorAll(selector).length
 return {page:path.endsWith('/application.xhtml')?'application':path.endsWith('/summary.xhtml')?'summary':path.endsWith('/portfolioManager.xhtml')?'portfolio':'other',forms:[...doc.querySelectorAll('form')].map(f=>f.id),components:[...doc.querySelectorAll('[id]')].slice(0,120).map(n=>n.id),applicants:count('#ApplicantForm tr[data-ri]'),creators:count('#CreatorForm tr[data-ri]'),priorities:count('#PriorityForm tr[data-ri]'),designs:count('#designForm\\:designsDataTable_data tr[data-ri]'),reproductions:count('#designForm\\:reproDT_data tr[data-ri]'),summary:path.endsWith('/summary.xhtml'),draftList:!!doc.getElementById('portfolio'),referenceConfirmed}
}
export function structureDiff(before:StructureSnapshot,after:StructureSnapshot):string[]{
 const diff:string[]=[]
 if(before.page!==after.page)diff.push(`navigation ${before.page} -> ${after.page}`)
 for(const key of ['applicants','creators','priorities','designs','reproductions'] as const)if(before[key]!==after[key])diff.push(`${key} ${before[key]} -> ${after[key]}`)
 for(const key of ['forms','components'] as const){if(after[key].some(v=>!before[key].includes(v)))diff.push(`${key==='forms'?'form':'component'} appeared`);if(before[key].some(v=>!after[key].includes(v)))diff.push(`${key==='forms'?'form':'component'} disappeared`)}
 return diff
}
export function xmlEvidence(xml:Document):Partial<TraceEvent>{
 let validationFailed=false
 for(const node of xml.querySelectorAll('extension'))try{const args:unknown=JSON.parse(node.textContent??'');if(args&&typeof args==='object'&&'validationFailed'in args&&args.validationFailed===true)validationFailed=true}catch{/* Do not store extension contents. */}
 return {redirectDetected:!!xml.querySelector('redirect'),xmlParsed:!xml.querySelector('parsererror'),parserError:!!xml.querySelector('parsererror'),jsfError:!!xml.querySelector('error'),validationFailed,updateCount:xml.querySelectorAll('update').length,insertCount:xml.querySelectorAll('insert').length,deleteCount:xml.querySelectorAll('delete').length,updatedComponents:[...xml.querySelectorAll('update')].map(n=>n.id)}
}
export async function viewStateDigest(value:string):Promise<string|undefined>{try{return 'sha256:'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('')}catch{return undefined}}
