import type { HagueRow } from './workflow'

export function draftReviewNotes(row:HagueRow,error?:string):string[] {
  return [...new Set([...(row.filing?.draftCorrections??[]),...(row.decision?.warnings??[]),...(row.draft?.warnings??[]),...(row.draft?.error?[row.draft.error]:[]),...(error?[error]:[])])].map(note=>`${row.folder.caseVolume}：${note}`)
}

/** One completion popup, including review notes; all content is plain text. */
export function showDraftCompletion(message:string,notes:string[]):HTMLDialogElement {
  document.getElementById('hague-draft-completion')?.remove()
  const dialog=document.createElement('dialog')
  dialog.id='hague-draft-completion'
  dialog.setAttribute('aria-labelledby','hague-draft-completion-title')
  Object.assign(dialog.style,{maxWidth:'760px',width:'min(760px, 90vw)',maxHeight:'80vh',overflow:'auto',border:'1px solid #dfcedf',borderRadius:'16px',padding:'24px',color:'var(--text, #302738)',background:'var(--card, white)'})
  const title=document.createElement('h2');title.id='hague-draft-completion-title';title.textContent='草稿处理完成'
  const text=document.createElement('p');text.textContent=message
  dialog.append(title,text)
  if(notes.length){
    const heading=document.createElement('h3');heading.textContent='递交前请核对'
    const list=document.createElement('ul')
    for(const note of new Set(notes)){const item=document.createElement('li');item.textContent=note;list.append(item)}
    dialog.append(heading,list)
  }
  const close=document.createElement('button');close.type='button';close.className='solid';close.textContent='我知道了';close.addEventListener('click',()=>dialog.close())
  dialog.append(close);dialog.addEventListener('close',()=>dialog.remove(),{once:true})
  document.body.append(dialog);dialog.showModal();return dialog
}
