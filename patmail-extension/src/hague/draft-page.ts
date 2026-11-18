import type { DraftCommand, DraftReceipt } from './draft-contract'

/** Injected in MAIN world. No imports, external closures, arbitrary scripts, fetch or payment controls. */
export async function executeDraftPage(command: DraftCommand, expectedReference?: string, context?:{document:Document;window:unknown;location:Pick<Location,'origin'|'pathname'>;virtual?:boolean;idle?:()=>Promise<void>}): Promise<DraftReceipt> {
  const document=context?.document??globalThis.document,window=context?.window??globalThis.window,location=context?.location??globalThis.location
  const win = window as unknown as { PrimeFaces?: { ajax: { Queue: { isEmpty(): boolean } }; widgets: Record<string, { cfg: { paginator?: { rowCount: number; rows: number } }; getPaginator?(): { setPage(page: number): void } }> } }
  const sleep = (ms: number) => new Promise<void>(r=>setTimeout(r,ms))
  const until = async (test:()=>boolean, label:string, limit=20000) => { const end=Date.now()+limit; while(!test()) { if(Date.now()>end) throw new Error(`${label}超时；请检查原站，勿重复写入。`); await sleep(100) } }
  const idle = async () => { if(context?.idle){await context.idle();return}await sleep(150); await until(()=>!win.PrimeFaces || win.PrimeFaces.ajax.Queue.isEmpty(),'等待原站响应') }
  const byId = <T extends HTMLElement>(id:string): T => { const el=document.getElementById(id); if(!el)throw new Error(`原站控件缺失：${id}`);return el as T }
  const btn = (form:string,text:string) => {const matches=[...byId(form).querySelectorAll<HTMLButtonElement>('button')].filter(e=>e.textContent?.trim()===text);if(matches.length!==1)throw new Error(`无法唯一定位 ${form} / ${text}`);return matches[0]}
  const click = async (e:HTMLElement) => { if(e instanceof HTMLButtonElement && e.disabled)throw new Error('原站按钮暂不可用');e.click();await idle() }
  const set = (id:string, value:string) => {
    const e=byId<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>(id)
    if(e instanceof HTMLSelectElement) { const option=[...e.options].find(o=>o.value===value || o.text===value || o.value.startsWith(`${value} - `) || o.text.endsWith(` - ${value}`));if(!option)throw new Error(`原站选项不可用：${id} / ${value}`);e.value=option.value }
    else e.value=value
    e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))
  }
  const errors = () => [...document.querySelectorAll<HTMLElement>('.ui-message-error,.ui-messages-error,.b-input__error,[id$=":error"]')].filter(e=>e.textContent?.trim()).map(e=>e.textContent.trim())
  const warnings:string[]=[]
  const ensure = () => {const found=errors();if(found.length)throw new Error(found.join('；').slice(0,700))}
  const count = (prefix:string) => document.querySelectorAll(`button[id^="${prefix}"]`).length
  const applicantCount = () => document.querySelectorAll('button[id^="ApplicantForm:applicantViewPanel:"][id$=":editApp"]').length
  const creatorCount = () => document.querySelectorAll('#CreatorForm button[title="Open/edit"],#CreatorForm button[id$=":editCre"]').length
  const designCount = () => document.querySelectorAll('button[id^="designForm:designsDataTable:"][id$=":addReproduction"]').length
  const reproCount = () => win.PrimeFaces?.widgets.reproDTW?.cfg.paginator?.rowCount ?? document.getElementById('designForm:reproDT_data')?.querySelectorAll('tr[data-ri]').length ?? 0
  const snapshot = (): DraftReceipt => ({ ok:true,reference:/WIPO reference\s+(\d+)/i.exec(document.title+' '+(document.body.innerText??document.body.textContent))?.[1],page:location.pathname.endsWith('/portfolioManager.xhtml')?'portfolio':location.pathname.endsWith('/application.xhtml')?'application':/summary/i.test(location.pathname)?'summary':'other',applicants:applicantCount(),creators:creatorCount(),priorities:document.querySelectorAll('#PriorityForm button[title="Open/edit"]').length,designs:designCount(),reproductions:reproCount() })
  try {
    if(location.origin!=='https://hague.wipo.int' || !location.pathname.startsWith('/HagueEFilingWeb/protected/'))throw new Error('eHague 登录已失效或当前页面不受支持。')
    if(command.op==='inspect' && expectedReference && location.pathname.endsWith('/portfolioManager.xhtml')) {
      const draftTab=[...document.querySelectorAll<HTMLButtonElement>('#quickSearchPanel button.filtered')].some(e=>/^Draft\(s\)/.test(e.textContent?.trim()??''))
      const exists=[...document.querySelectorAll<HTMLTableRowElement>('#portfolio tbody tr')].some(r=>r.cells[0]?.textContent?.trim()===`WIPO${expectedReference}`)
      return {...snapshot(),draftSaved:draftTab&&exists}
    }
    if(expectedReference && snapshot().reference!==expectedReference)throw new Error('当前 WIPO reference 与本案检查点不同，未写入其他草稿。')
    if(command.op==='inspect')return snapshot()
    if(command.op==='prepare') {
      if(!document.getElementById('portfolio'))throw new Error('请先关闭当前编辑器，回到 eHague New 页面后创建下一案。')
      if(!document.querySelector('#portfolio select'))await click(btn('quickSearchPanel','New'))
      const language=document.querySelector<HTMLSelectElement>('#portfolio select');if(!language)throw new Error('请在 eHague New 页面开始。');set(language.id,'en')
      const radio=[...document.querySelectorAll<HTMLInputElement>('#portfolio input[type=radio]')].find(e=>document.querySelector(`label[for="${CSS.escape(e.id)}"]`)?.textContent?.trim()==='New application')
      if(!radio)throw new Error('未找到 New application 选项。');if(!radio.checked)await click(radio)
      return snapshot()
    }
    if(command.op==='create') { btn('portfolio','Confirm').click();return {ok:true,page:'portfolio'} }
    if(command.op==='summary') {byId('headerForm:sum').click();return snapshot()}
    if(command.op==='backToApplication') {byId('headerForm:back').click();return snapshot()}
    if(command.op==='print') {
      throw new Error('Summary PDF 由后台打印通道处理。')
    }
    if(command.op==='saveDraft') {
      const close=document.getElementById('headerForm:backApp') ?? [...document.querySelectorAll<HTMLElement>('button')].find(e=>e.textContent?.trim()==='Close')
      if(!close)throw new Error('未找到保存草稿的 Close 控件。');await click(close)
      const dialog=[...document.querySelectorAll<HTMLElement>('.ui-dialog')].find(e=>(context?.virtual||e.offsetWidth)&&e.textContent?.includes('Draft(s)'))
      if(!dialog)throw new Error('未出现存草稿确认框。')
      const yes=[...dialog.querySelectorAll<HTMLButtonElement>('button')].find(e=>e.textContent?.trim()==='Yes');if(!yes)throw new Error('存草稿确认控件缺失。');yes.click();return snapshot()
    }
    if(!location.pathname.endsWith('/application.xhtml'))throw new Error('请在对应申请草稿编辑器中继续。')
    if(command.op==='applicant' || command.op==='representative') {
      const representative=command.op==='representative'
      if(!representative && applicantCount()!==command.index)throw new Error('申请人记录数量与检查点不符，请先核对前一位申请人的保存回执，未继续添加。')
      if(representative && count('ApplicantForm:representativesViewPanel:'))throw new Error('草稿已有代理机构，未重复添加。')
      await click(byId(representative?'ApplicantForm:repBtn':'ApplicantForm:showApplicantForm'))
      const legal=document.querySelector<HTMLInputElement>('#ApplicantForm input[type=radio][value=true]');if(!legal)throw new Error('缺少法人选项');if(!legal.checked)await click(legal)
      const a=command.data
      set(representative?'ApplicantForm:name:input':'ApplicantForm:firstname:input',a.name)
      for(const [key,v]of Object.entries({address:a.address,cp:a.postalCode,city:a.city,state:a.region,country:a.country,email:representative?command.data.email:command.email}))set(`ApplicantForm:${key}:input`,v)
      if(!representative){
        const country=['SG','Singapore','SG - Singapore'].includes(a.country)?'SG':['CN','China','CN - China'].includes(a.country)?'CN':''
        if(!country)throw new Error('申请人的资格国家尚未支持，未采用中国默认值。')
        for(const key of ['nationality','domicile','establishment','residence']){set(`ApplicantForm:${key}:input`,country);await idle()}
        set('ApplicantForm:acp:input',country)
        if(country!=='CN')warnings.push(`申请人 ${command.index+1} 的资格国家和 ACP 按本案来源国家 ${country} 填写为草稿候选，请审核国籍、住所、营业所及惯常居所。`)
        if(!a.postalCode)warnings.push(`申请人 ${command.index+1} 未提供邮编；原站邮编为选填，已留空，请在递交前核对。`)
      }
      await click(byId(representative?'ApplicantForm:saveRepBtn':'ApplicantForm:saveAppBtn'));ensure()
      if(document.getElementById(representative?'ApplicantForm:saveRepBtn':'ApplicantForm:saveAppBtn'))throw new Error('原站尚未确认保存申请人/代理机构。')
      if(!representative&&applicantCount()!==command.index+1)throw new Error('申请人保存后记录数量不符，请核对原站回执。')
    } else if(command.op==='parties') {
      if(!document.querySelector('#Designationform input[type=checkbox]'))await click(byId('Designationform:desPanel:changeDesignationsSelection'))
      const extra=[...document.querySelectorAll<HTMLInputElement>('#Designationform input[type=checkbox]:checked')].map(e=>/value:\s*'([A-Z]{2})'/.exec(e.getAttribute('onclick')??'')?.[1]).filter((code):code is string=>!!code&&!command.codes.includes(code))
      for(const code of extra){const box=[...document.querySelectorAll<HTMLInputElement>('#Designationform input[type=checkbox]:checked')].find(e=>e.getAttribute('onclick')?.includes(`value: '${code}'`));if(box)await click(box)}
      for(const code of command.codes){const boxes=[...document.querySelectorAll<HTMLInputElement>('#Designationform input[type=checkbox]')];const e=boxes.find(e=>e.getAttribute('onclick')?.includes(`value: '${code}'`));if(!e)throw new Error(`不支持指定缔约方 ${code}`);if(!e.checked)await click(e)}
      const checked=[...document.querySelectorAll<HTMLInputElement>('#Designationform input[type=checkbox]:checked')].map(e=>/value:\s*'([A-Z]{2})'/.exec(e.getAttribute('onclick')??'')?.[1]).filter(Boolean)
      if(checked.length!==command.codes.length||checked.some(c=>!command.codes.includes(c!)))throw new Error('原站指定国与本案清单不一致，已停止。')
      await click(btn('Designationform','Ok'));ensure()
    } else if(command.op==='locarno') {set('locarnoClassForm:locClass:input',String(Number(command.value)));await idle();ensure()}
    else if(command.op==='design') {
      if(designCount()!==command.index)throw new Error('设计数量与检查点不一致，未重复创建。')
      await click(btn('designForm','Add design'));set('designForm:selectSubClass:input',command.subclass);await idle();set('designForm:productIndication:inputAutoComplete:input',command.product)
      await click(byId('designForm:SaveAddDesignBtn'));ensure();if(!document.getElementById('designForm:fileuploader:fileupload_input'))throw new Error('设计未进入图纸上传步骤。')
    } else if(command.op==='openDesign') {await click(byId(`designForm:designsDataTable:${command.index}:addReproduction`))}
    else if(command.op==='upload') {
      if(reproCount()!==command.count)throw new Error('图纸数量与检查点不一致，未重复上传。')
      const bytes=Uint8Array.from(atob(command.base64),c=>c.charCodeAt(0));const file=new File([bytes],command.name,{type:command.mime});const transfer=new DataTransfer();transfer.items.add(file)
      const input=byId<HTMLInputElement>('designForm:fileuploader:fileupload_input');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}))
      await until(()=>reproCount()===command.count+1||errors().length>0,'等待图纸上传回执',60000);ensure();await idle()
    } else if(command.op==='legend') {
      const widget=win.PrimeFaces?.widgets.reproDTW
      const locate=()=>[...document.querySelectorAll<HTMLTableRowElement>('[id="designForm:reproDT_data"] tr[data-ri]')].find(r=>r.cells[2]?.textContent?.trim()===command.name)
      if(!locate()&&widget?.getPaginator){const rows=widget.cfg.paginator?.rows??10;widget.getPaginator().setPage(Math.max(0,Math.ceil(reproCount()/rows)-1));await idle()}
      const row=locate();if(!row)throw new Error(`未读到图纸 ${command.name} 回执，未修改其他图纸。`)
      const edit=row.querySelector<HTMLElement>('button[title="Open/edit"]');if(!edit)throw new Error('图纸 Legend 编辑控件缺失');await click(edit)
      const select=byId<HTMLSelectElement>('designForm:legend:input');const normalize=(s:string)=>s.toLowerCase().replace(/[-\s]/g,'').replace(/view$/,'')
      const option=[...select.options].find(o=>normalize(o.text)===normalize(command.label))
      set(select.id,option?.value??'0');await idle()
      if(!option)set('designForm:legendText:input',command.label)
      await click(btn('designForm','Save'));ensure()
    } else if(command.op==='closeDesign') {await click(btn('designForm','Ok'));ensure()}
    else if(command.op==='description') {if(!document.getElementById('DescriptionForm:texto:input'))await click(byId('DescriptionForm:addDescription'));await click(btn('DescriptionForm','Select all'));set('DescriptionForm:texto:input',command.text);await click(byId('DescriptionForm:save'));ensure();if(document.getElementById('DescriptionForm:texto:input'))throw new Error('说明尚未保存。')}
    else if(command.op==='creator') {
      if(creatorCount()!==command.index)throw new Error('设计人记录数量与检查点不符，未重复添加。')
      const add=document.querySelector<HTMLElement>('#CreatorForm button[id$=":addCreator"]');if(!add)throw new Error('缺少添加设计人控件');await click(add)
      const a=command.address;for(const [key,v]of Object.entries({name:command.givenName,lastname:command.familyName,address:a.address,cp:a.postalCode,city:a.city,state:a.region,country:a.country}))set(`CreatorForm:${key}:input`,v)
      await click(btn('CreatorForm','Select all'));await click(byId('CreatorForm:buttonSave'));ensure();if(document.getElementById('CreatorForm:name:input'))throw new Error('设计人尚未保存。')
    } else if(command.op==='priority') {
      if(document.querySelectorAll('#PriorityForm button[title="Open/edit"]').length!==command.index)throw new Error('优先权记录数量与检查点不符，未重复添加。')
      if(!document.getElementById('PriorityForm:nbFiling:input'))await click(byId('PriorityForm:AddPriority'));const country=document.querySelector<HTMLSelectElement>('#PriorityForm select:not([multiple])');if(!country)throw new Error('优先权地区控件缺失');set(country.id,command.data.country);await idle()
      const selectAll=[...byId('PriorityForm').querySelectorAll<HTMLButtonElement>('button')].find(e=>e.textContent?.trim()==='Select all');if(selectAll)await click(selectAll)
      set('PriorityForm:nbFiling:input',command.data.number);const date=document.querySelector<HTMLInputElement>('#PriorityForm input[id$="input_input"]');if(!date)throw new Error('优先权日期控件缺失');set(date.id,command.data.date.split('-').reverse().join('/'))
      const das=command.data.das;if(das&&!/^[A-Za-z0-9]{4}$/.test(das))warnings.push(`优先权 ${command.index+1} 原始 DAS 接入码不符合四位格式，草稿留空，请人工补充；原值保留在核对材料中。`)
      set('PriorityForm:dascode:input',/^[A-Za-z0-9]{4}$/.test(das)?das:'');await click(byId('PriorityForm:save'));ensure();if(document.getElementById('PriorityForm:nbFiling:input')||document.querySelectorAll('#PriorityForm button[title="Open/edit"]').length!==command.index+1)throw new Error('优先权尚未保存。')
    } else if(command.op==='publication') {
      const edit=document.querySelector<HTMLElement>('#PublicationForm button:not([id$="savePublicationBtn"])');if(!edit)throw new Error('公开时间编辑控件缺失');await click(edit)
      const value=command.months===0?'Immediat':command.months===12?'Pub6':'Ajourn';const radio=document.querySelector<HTMLInputElement>(`#PublicationForm input[type=radio][value="${value}"]`);if(!radio)throw new Error('公开选项缺失');await click(radio)
      if(value==='Ajourn')set('PublicationForm:comboAjourn:input',`${command.months} months.`)
      await click(byId('PublicationForm:savePublicationBtn'));ensure();if(document.getElementById('PublicationForm:select2:input'))throw new Error('公开时间尚未保存。')
    } else if(command.op==='signature') {
      const checkbox=[...document.querySelectorAll<HTMLInputElement>('#signForm input[type=checkbox]')].find(e=>document.querySelector(`label[for="${CSS.escape(e.id)}"]`)?.textContent?.trim()===command.representative)
      if(!checkbox)throw new Error('未找到本案代理机构签名选项');if(!checkbox.checked)await click(checkbox);set('signForm:firstname:input',command.reference);await click(btn('signForm','Save'));ensure()
    }
    return {...snapshot(),...(warnings.length?{warnings}:{})}
  } catch(error) {return {ok:false,error:error instanceof Error?error.message:'原站操作失败，请核对草稿。'}}
}
