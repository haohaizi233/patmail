import type { DraftCommand,DraftRecovery } from './draft-contract'

export function recoverableDraftCommand(command:DraftCommand):boolean {
  return ['create','applicant','parties','locarno','priority','saveDraft'].includes(command.op)
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
