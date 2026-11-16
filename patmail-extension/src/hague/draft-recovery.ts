import type { DraftCommand,DraftRecovery } from './draft-contract'

export function recoverableDraftCommand(command:DraftCommand):boolean {
  return ['create','applicant','parties','locarno','design','upload','legend','creator','priority','summary','backToApplication','saveDraft'].includes(command.op)
}

/** Design save can succeed before a passive JSF update fails. Read the saved
 * table rather than editor inputs; never re-create an existing design. */
export function inspectDesignRecovery(doc:Document,command:Extract<DraftCommand,{op:'design'}>,reference:string):DraftRecovery {
  const table=doc.getElementById('designForm:designsDataTable_data')
  if(!table||!Number.isSafeInteger(command.index)||command.index<0)return{outcome:'unknown'}
  const rows=[...table.querySelectorAll<HTMLTableRowElement>('tr[data-ri]')]
  const receipt={ok:true,reference,page:'application' as const,designs:rows.length}
  if(rows.length===0&&command.index===0)return{outcome:'retry',receipt}
  if(rows.length!==command.index+1)return{outcome:'unknown'}
  const values=[...rows[command.index].cells].map(c=>(c.textContent??'').trim().replace(/\s+/g,' '))
  if(values.length<4||values[0]!==String(command.index+1)||values[1]!=='0'||!/^\d+$/.test(values[2])||Number(values[2])!==Number(command.subclass)||values[3]!==command.product.trim().replace(/\s+/g,' '))return{outcome:'unknown'}
  return{outcome:'completed',receipt}
}

export function inspectUploadRecovery(doc:Document,command:Extract<DraftCommand,{op:'upload'}>,reference:string,total?:number):DraftRecovery {
  const body=doc.getElementById('designForm:reproDT_data')
  if(!body||!Number.isSafeInteger(command.count)||command.count<0)return{outcome:'unknown'}
  const rows=[...body.querySelectorAll<HTMLTableRowElement>('tr[data-ri]')],count=total??rows.length
  const matches=rows.filter(r=>r.cells[2]?.textContent?.trim()===command.name)
  const receipt={ok:true,reference,page:'application' as const,reproductions:count}
  if(count===command.count&&rows.length===count&&!matches.length)return{outcome:'retry',receipt}
  return count===command.count+1&&matches.length===1?{outcome:'completed',receipt}:{outcome:'unknown'}
}

/** Read canonical display records, never infer success from an open editor's values. */
export function inspectPriorityRecovery(doc:Document,command:Extract<DraftCommand,{op:'priority'}>,reference:string):DraftRecovery {
  const form=doc.getElementById('PriorityForm')
  if(!form||!form.querySelector('[id="PriorityForm:AddPriority"]'))return{outcome:'unknown'}
  const buttons=[...form.querySelectorAll('button[title="Open/edit"]')]
  const receipt={ok:true,reference,page:'application' as const,priorities:buttons.length}
  if(buttons.length===command.index)return{outcome:'retry',receipt}
  if(buttons.length!==command.index+1)return{outcome:'unknown'}
  const names:Record<string,string>={CN:'China',SG:'Singapore',US:'United States',GB:'United Kingdom',JP:'Japan',KR:'Republic of Korea',EM:'European Union'}
  const country=command.data.country,date=command.data.date.split('-').reverse().join('/')
  const button=buttons[command.index]
  for(let row=button.parentElement;row&&row!==form;row=row.parentElement){
    if(row.querySelectorAll('button[title="Open/edit"]').length!==1)break
    const clone=row.cloneNode(true) as HTMLElement
    for(const node of clone.querySelectorAll('script,style,input,select,textarea'))node.remove()
    const walker=doc.createTreeWalker(clone,4),parts:string[]=[]
    while(walker.nextNode())parts.push(walker.currentNode.textContent??'')
    const text=parts.join(' ')
    const tokens=text.split(/\s+/)
    const countries=new Set([country,...(names[country]?[names[country],`${country} - ${names[country]}`]:[])])
    const countryMatches=[...clone.querySelectorAll('*')].some(e=>!e.children.length&&countries.has((e.textContent??'').trim().replace(/\s+/g,' ')))
    if(tokens.includes(command.data.number)&&tokens.includes(date)&&countryMatches)return{outcome:'completed',receipt}
  }
  return{outcome:'unknown'}
}
