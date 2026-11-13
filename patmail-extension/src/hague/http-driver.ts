import { HagueHttpContext, type JsfAction, type HagueFetch } from './http-context'
import { executeDraftPage } from './draft-page'
import type { DraftCommand, DraftReceipt,DraftCheckpoint,DraftRecovery } from './draft-contract'
import { inspectPriorityRecovery } from './draft-recovery'

const quoted=(text:string,key:string)=>new RegExp(`(?:^|[,\\s{])${key}:\\s*['"]([^'"]*)['"]`).exec(text)?.[1]
/** Static PrimeFaces metadata parser. It never evaluates script text. */
export function jsfAction(script:string,element:HTMLElement,doc:Document):JsfAction|null {
  const mojarra=/mojarra\.ab\(this,event,['"]([^'"]+)['"],['"]([^'"]*)['"],['"]([^'"]*)['"]\)/.exec(script)
  if(mojarra)return{source:element.id,event:mojarra[1],process:mojarra[2],update:mojarra[3]}
  const ab=/PrimeFaces\.ab\(\{([\s\S]*?)\}\)/.exec(script)?.[1]
  if(ab){return {source:quoted(ab,'s')??element.id,form:quoted(ab,'f'),process:quoted(ab,'p'),update:quoted(ab,'u'),event:quoted(ab,'e')}}
  const remote=/\b(selectOffice|processFile)\s*\(/.exec(script)?.[1]
  if(remote){
    const scripts=[...doc.querySelectorAll('script')].map(s=>s.textContent).join('\n')
    const body=new RegExp(`${remote}\\s*=\\s*function\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\}(?:;|$)`,'m').exec(scripts)?.[1]
      ??new RegExp(`function\\s+${remote}\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\}`).exec(scripts)?.[1]
    const action=body?jsfAction(body,element,doc):null
    if(!action)throw new Error(`未识别接口 remoteCommand：${remote}`)
    const params:Record<string,string>={}
    for(const m of script.matchAll(/name:\s*['"]([^'"]+)['"],\s*value:\s*['"]([^'"]*)['"]/g))params[m[1]]=m[2]
    return {...action,params}
  }
  if(/jsfcljs|mojarra\.jsfcljs/.test(script))return{source:element.id,form:element.closest('form')?.id,full:true}
  return null
}

/** Detached DOM is a protocol model only; actual page DOM and PrimeFaces globals stay untouched. */
export class HagueHttpDriver {
  readonly state:HagueHttpContext
  private running=false
  private commandFailure?:Error
  constructor(id:string,fetcher?:HagueFetch){
    this.state=new HagueHttpContext(id,fetcher)
    const dispatch=(event:Event)=>{
      const element=event.target instanceof HTMLElement?event.target.closest<HTMLElement>('button,input,select,textarea,a'):null
      if(!element)return
      try{
        if(event.type==='input'){
          if(element instanceof HTMLInputElement&&element.id.endsWith(':inputAutoComplete:input')){
            const hidden=this.state.document.getElementById(element.id.replace(/:inputAutoComplete:input$/,':inputHidden')) as HTMLInputElement|null
            if(hidden)hidden.value=element.value
          }
          return
        }
        const script=element.getAttribute(event.type==='change'?'onchange':'onclick')??''
        const action=jsfAction(script,element,this.state.document)
        if(action){
          // Canceling a radio/checkbox click rolls its preactivated checked state back.
          if(!(element instanceof HTMLInputElement&&/^(radio|checkbox)$/.test(element.type)))event.preventDefault()
          void this.state.post(action).catch(e=>{this.commandFailure=e instanceof Error?e:new Error('接口失败')})
        }
        else if(event.type==='click'&&element instanceof HTMLButtonElement&&element.type==='submit'&&!/PF\(|return false/.test(script)){
          event.preventDefault();void this.state.post({source:element.id,full:true}).catch(e=>{this.commandFailure=e instanceof Error?e:new Error('接口失败')})
        }
      }catch(e){this.commandFailure=e instanceof Error?e:new Error('接口配置未识别')}
    }
    this.state.document.addEventListener('click',dispatch,true)
    this.state.document.addEventListener('change',dispatch,true)
    this.state.document.addEventListener('input',dispatch,true)
  }
  private checkFailure():void{const failure=this.commandFailure??this.state.failure;if(failure)throw failure}
  async initialize():Promise<void>{await this.state.get()}
  /** Run only on a new chain: navigation and canonical readback precede any retry. */
  async recoverStep(command:DraftCommand,checkpoint:DraftCheckpoint):Promise<DraftRecovery>{
    const reference=checkpoint.reference
    if(!reference||!/^\d+$/.test(reference))return{outcome:'unknown'}
    try{
      if(command.op==='saveDraft'){
        const ack=checkpoint.acknowledged
        if(ack?.next!==checkpoint.next||ack.op!=='saveDraft'||ack.page!=='portfolio')return{outcome:'unknown'}
        await this.initialize()
        const tab=[...this.state.document.querySelectorAll<HTMLButtonElement>('#quickSearchPanel button')].find(e=>/^Draft\(s\)/.test(e.textContent?.trim()??''))
        if(!tab)return{outcome:'unknown'}
        tab.click();await this.state.settle()
        const receipt=await this.call({op:'inspect'},reference)
        return receipt.ok&&receipt.draftSaved?{outcome:'completed',receipt:{...receipt,reference}}:{outcome:'unknown'}
      }
      if(!['priority','parties','locarno'].includes(command.op))return{outcome:'unknown'}
      await this.resume(reference)
      if(command.op==='priority'){
        await this.remote('refreshOptionsUI')
        return inspectPriorityRecovery(this.state.document,command,reference)
      }
      if(command.op==='parties'){
        await this.remote('refreshDesignationUI')
        return this.state.document.getElementById('Designationform')?{outcome:'retry',receipt:{ok:true,reference,page:'application'}}:{outcome:'unknown'}
      }
      if(command.op==='locarno'){
        await this.remote('refreshDesignUI')
        const input=this.state.document.getElementById('locarnoClassForm:locClass:input') as HTMLSelectElement|null
        if(!input)return{outcome:'unknown'}
        return{outcome:Number(input.value)===Number(command.value)?'completed':'retry',receipt:{ok:true,reference,page:'application'}}
      }
      return{outcome:'unknown'}
    }catch{return{outcome:'unknown',reason:'原站回执暂无法确认，保留检查点等待核对。'}}
  }
  async resume(reference:string):Promise<void>{
    if(!/^\d+$/.test(reference))throw new Error('恢复的 WIPO reference 无效。')
    await this.initialize()
    const draftTab=[...this.state.document.querySelectorAll<HTMLButtonElement>('#quickSearchPanel button')].find(e=>/^Draft\(s\)/.test(e.textContent?.trim()??''))
    if(!draftTab)throw new Error('未识别 Draft(s) 接口入口。')
    draftTab.click();await this.state.settle()
    const row=await this.locateDraft(reference)
    if(!row)throw new Error('Draft(s) 未精确找到本案编号，未创建替代草稿。')
    const open=[...row.querySelectorAll<HTMLElement>('button,a')].filter(e=>/^(?:Open|Edit)$|Open\/edit/i.test((e.getAttribute('title')??'')+' '+(e.textContent?.trim()??'')))
    if(open.length!==1)throw new Error('本案打开动作无法唯一识别，未操作其他记录。')
    open[0].click();await this.state.settle()
    if(this.state.reference!==reference||!this.state.location.pathname.endsWith('/application.xhtml'))throw new Error('恢复未确认本案编辑器和编号，未继续写入。')
  }
  private async locateDraft(reference:string):Promise<HTMLTableRowElement|undefined>{
    const findRow=()=>[...this.state.document.querySelectorAll<HTMLTableRowElement>('#portfolio tbody tr')].find(r=>r.cells[0]?.textContent?.trim()===`WIPO${reference}`)
    let row=findRow()
    if(!row){
      const table=this.state.document.querySelector<HTMLElement>('#portfolio .ui-datatable[id]')
      const config=[...this.state.document.scripts].map(s=>s.textContent??'').find(s=>table&&s.includes(`id:"${table.id}"`)&&s.includes('paginator:'))??''
      const rows=Number(/\brows:\s*(\d+)/.exec(config)?.[1]),count=Number(/\browCount:\s*(\d+)/.exec(config)?.[1])
      if(table&&Number.isSafeInteger(rows)&&rows>0&&count<=10000){
        for(let first=0;first<count&&!row;first+=rows){
          await this.state.post({source:table.id,form:'portfolio',process:table.id,update:table.id,params:{[`${table.id}_pagination`]:'true',[`${table.id}_first`]:String(first),[`${table.id}_rows`]:String(rows),[`${table.id}_skipChildren`]:'true',[`${table.id}_encodeFeature`]:'true'}})
          row=findRow()
        }
      }
    }
    return row
  }
  private async remote(name:string,params?:Record<string,string>):Promise<void>{
    const definition=[...this.state.document.querySelectorAll('script')].map(s=>s.textContent??'').find(s=>new RegExp(`${name}\\s*=\\s*function`).test(s))
    const action=definition?jsfAction(definition,this.state.document.createElement('button'),this.state.document):null
    if(!action)throw new Error(`原站接口命令未识别：${name}`)
    await this.state.post({...action,params})
  }
  private reproCount():number{
    const script=[...this.state.document.querySelectorAll('script')].map(s=>s.textContent).find(s=>s?.includes('"reproDTW"'))??''
    return Number(/rowCount:\s*(\d+)/.exec(script)?.[1]??this.state.document.getElementById('designForm:reproDT_data')?.querySelectorAll('tr[data-ri]').length??0)
  }
  private async upload(command:Extract<DraftCommand,{op:'upload'}>):Promise<void>{
    if(this.reproCount()!==command.count)throw new Error('本接口链图纸计数不符，未重复上传。')
    if(!/^\d+\.\d+\.(?:jpe?g|tiff?)$/i.test(command.name)||!['image/jpeg','image/tiff'].includes(command.mime))throw new Error('接口图纸名称或类型无效。')
    const bytes=Uint8Array.from(atob(command.base64),c=>c.charCodeAt(0))
    if(bytes.length>2097152)throw new Error('图纸超过 2MB。')
    const input=this.state.document.getElementById('designForm:fileuploader:fileupload_input') as HTMLInputElement|null
    if(!input)throw new Error('本链上传控件缺失。')
    const source=input.id.replace(/_input$/,''),definition=[...this.state.document.querySelectorAll('script')].map(s=>s.textContent??'').find(s=>s.includes('"FileUpload"'))??''
    const process=quoted(definition,'process'),update=quoted(definition,'update')
    await this.state.post({source,form:input.closest('form')?.id,process:`${source}${process?' '+process:''}`,update},{field:source,file:new File([bytes],command.name,{type:command.mime})})
    await this.remote('processFile',{dtId:'designForm:reproDT'})
    if(this.reproCount()!==command.count+1)throw new Error('上传后本链图纸数量未确认，结果待核对。')
  }
  async call(command:DraftCommand,reference?:string):Promise<DraftReceipt>{
    if(this.running)throw new Error('本接口链仍在执行前一步，禁止交错请求。')
    if(this.state.failure||this.commandFailure)throw new Error('本接口链结果待核对，禁止重试写入。')
    this.running=true
    try{
      if(command.op==='inspect'&&reference&&this.state.location.pathname.endsWith('/portfolioManager.xhtml'))await this.locateDraft(reference)
      const required=command.op==='parties'?['Designationform','refreshDesignationUI']:['locarno','design','openDesign','upload','legend','closeDesign'].includes(command.op)?['designForm','refreshDesignUI']:['description','creator','priority','publication','signature'].includes(command.op)?[{description:'DescriptionForm',creator:'CreatorForm',priority:'PriorityForm',publication:'PublicationForm',signature:'signForm'}[command.op as 'description'|'creator'|'priority'|'publication'|'signature'],'refreshOptionsUI']:null
      if(required&&(required[1]==='refreshOptionsUI'||!this.state.document.getElementById(required[0])))await this.remote(required[1])
      const shim={PrimeFaces:{ajax:{Queue:{isEmpty:()=>{this.checkFailure();return this.state.pending===0}}},widgets:{reproDTW:{cfg:{paginator:{rowCount:this.reproCount(),rows:10}}}}}}
      const context={document:this.state.document,location:this.state.location,window:shim,virtual:true,idle:async()=>{await this.state.settle();this.checkFailure()}}
      let result:DraftReceipt
      if(command.op==='upload'){await this.upload(command);shim.PrimeFaces.widgets.reproDTW.cfg.paginator.rowCount=this.reproCount();result={ok:true}}
      else result=await executeDraftPage(command,reference,context)
      // Navigation buttons return before AJAX; settle the owning chain before exposing its receipt.
      await this.state.settle()
      this.checkFailure()
      if(!result.ok){this.commandFailure=new Error(result.error);return result}
      const snapshot=await executeDraftPage({op:'inspect'},reference??this.state.reference,context)
      if(command.op==='create'&&(snapshot.page!=='application'||!snapshot.reference)){
        const messages=[...this.state.document.querySelectorAll('.ui-message-error,.ui-messages-error,.b-input__error,[id$=":error"]')].map(node=>node.textContent?.trim()).filter(Boolean).join('；').slice(0,500)
        throw new Error(`接口创建回执未确认编辑器和 WIPO reference（返回 ${snapshot.page}），结果待核对，未自动重建。${messages?`原站提示：${messages}`:'未返回可识别校验提示，请先在原站核对是否已创建。'}`)
      }
      return {...snapshot,documentId:this.state.id,...(result.warnings?{warnings:result.warnings}:{})}
    }catch(error){this.commandFailure=error instanceof Error?error:new Error('接口链结果待核对');throw this.commandFailure}finally{this.running=false}
  }
}
