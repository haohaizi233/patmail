import {emitTrace,isDiagnosticModeEnabled} from './diagnostics/store'
import {HagueDiagnosticError,normalizeDiagnosticError} from './diagnostics/errors'
import {analyzeJavaScript,extractStaticActions,isStaticUiHandler,selectRemoteDefinition,type AstCall,type AstAnalysis} from './diagnostics/ast/analyzer.mjs'
import { HagueHttpContext, type JsfAction, type HagueFetch } from './http-context'
import { executeDraftPage } from './draft-page'
import type { DraftCommand, DraftReceipt,DraftCheckpoint,DraftRecovery } from './draft-contract'
import { inspectPriorityRecovery,inspectDesignRecovery,inspectUploadRecovery } from './draft-recovery'
import {summaryEvidenceKey} from './summary-evidence'

const unsupported=()=>new HagueDiagnosticError({errorCode:'PROTOCOL_UNSUPPORTED',errorStage:'ast',transportStatus:'not_dispatched',sideEffectMayHaveOccurred:false})
/** AST extraction is read-only. Ambiguous or dynamic handlers never become writes. */
export function jsfAction(script:string,element:HTMLElement,doc:Document,onAnalysis?:(report:AstAnalysis)=>void):JsfAction|null {
  const options={elementId:element.id,formId:element.closest('form')?.id}
  let actions=extractStaticActions(script,options)
  let report=analyzeJavaScript(script)
  const remote=/\b(selectOffice|processFile|refreshOptionsUI|refreshDesignUI|refreshDesignationUI)\s*\(/.exec(script)?.[1]
  if(!actions.length&&remote){
    const definitions=selectRemoteDefinition([...doc.scripts].map(s=>s.textContent??''),remote)
    if(definitions!==undefined){actions=extractStaticActions(script,{...options,definitions});report=analyzeJavaScript(script,{definitions})}
  }
  try{onAnalysis?.(report)}catch{/* Diagnostic observers cannot affect extraction. */}
  if(actions.length!==1){
    if(script.trim()&&!isStaticUiHandler(script))throw unsupported()
    return null
  }
  const {_kind,_line,_column,...action}=actions[0]
  Object.defineProperty(action,'analysis',{enumerable:false,value:{scriptHash:report.scriptHash,fingerprint:report.fingerprint,callType:_kind,line:_line,column:_column,confidence:'static'}})
  return action
}

/** Detached DOM is a protocol model only; actual page DOM and PrimeFaces globals stay untouched. */
export class HagueHttpDriver {
  readonly state:HagueHttpContext
  private running=false
  private commandFailure?:Error
  // Weak keys keep execution DOM/source lifetime within this chain; unchanged scripts are not re-parsed.
  private widgetReports=new WeakMap<HTMLScriptElement,{text:string;report:AstAnalysis;emittedTrace?:string}>()
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
        const action=jsfAction(script,element,this.state.document,report=>this.reportAnalysis(report))
        if(action){
          // Canceling a radio/checkbox click rolls its preactivated checked state back.
          if(!(element instanceof HTMLInputElement&&/^(radio|checkbox)$/.test(element.type)))event.preventDefault()
          void this.state.post(action).catch(e=>{this.commandFailure=e instanceof Error?e:new Error('接口失败')})
        }
        else if(event.type==='click'&&element instanceof HTMLButtonElement&&element.type==='submit'&&!/PF\(|return false/.test(script)){
          event.preventDefault();void this.state.post({source:element.id,full:true}).catch(e=>{this.commandFailure=e instanceof Error?e:new Error('接口失败')})
        }
      }catch(e){if(e instanceof HagueDiagnosticError&&this.state.trace)e.diagnostic.traceId=this.state.trace.traceId;this.commandFailure=e instanceof Error?e:unsupported()}
    }
    this.state.document.addEventListener('click',dispatch,true)
    this.state.document.addEventListener('change',dispatch,true)
    this.state.document.addEventListener('input',dispatch,true)
  }
  private reportAnalysis(report:AstAnalysis):void{
    if(!isDiagnosticModeEnabled())return
    const calls=report.calls.length?report.calls.slice(0,60):[undefined]
    for(const call of calls)emitTrace(this.state.trace,'protocol.analyzed',{protocolFingerprint:report.fingerprint,astCallType:call?.kind==='PrimeFaces.cw'?(call.widgetType==='FileUpload'?'fileUpload':call.widgetType==='DataTable'?'dataTable':'widget'):call?.kind,astConfidence:call?.confidence??'unresolved',sourceComponent:call?.source,form:call?.form,process:call?.process,update:call?.update,parameterNames:call?.parameterNames,sourceLocation:{scriptHash:report.scriptHash,line:call?.location.line,column:call?.location.column},unresolvedReasons:[...report.unresolved,...(call?.unresolvedReasons??[])],evidenceCodes:call?.confidence==='static'?['PROTOCOL_STATIC']:['PROTOCOL_UNRESOLVED']})
  }
  private checkFailure():void{const failure=this.commandFailure??this.state.failure;if(failure)throw failure}
  async initialize():Promise<void>{await this.state.get()}
  /** Run only on a new chain: navigation and canonical readback precede any retry. */
  async recoverStep(command:DraftCommand,checkpoint:DraftCheckpoint):Promise<DraftRecovery>{
    const reference=checkpoint.reference
    if(!reference||!/^\d+$/.test(reference))return{outcome:'unknown'}
    try{
      if(command.op==='backToApplication'||command.op==='summary'){
        await this.resume(reference)
        const receipt=await this.call(command.op==='summary'?{op:'summary'}:{op:'inspect'},reference)
        return receipt.ok&&receipt.reference===reference&&receipt.page===(command.op==='summary'?'summary':'application')?{outcome:'completed',receipt}:{outcome:'unknown'}
      }
      if(command.op==='create'){
        // Only recover the allocation boundary. Never allocate a replacement or save unknown fields.
        if(checkpoint.next!==1||checkpoint.status!=='uncertain'||!checkpoint.planKey)return{outcome:'unknown'}
        await this.resume(reference)
        const receipt=await this.call({op:'inspect'},reference)
        return receipt.ok&&receipt.reference===reference&&receipt.page==='application'?{outcome:'completed',receipt}:{outcome:'unknown'}
      }
      if(command.op==='applicant'||command.op==='representative'){
        const representative=command.op==='representative',index=command.op==='applicant'?command.index:0
        if(checkpoint.status!=='uncertain'||!checkpoint.planKey||!representative&&(!Number.isSafeInteger(index)||index<0||checkpoint.next!==index+2))return{outcome:'unknown'}
        const a=command.data,country=['SG','Singapore','SG - Singapore'].includes(a.country)?'SG':['CN','China','CN - China'].includes(a.country)?'CN':''
        if(!country)return{outcome:'unknown'}
        await this.resume(reference)
        const repButtons=()=>[...this.state.document.querySelectorAll<HTMLButtonElement>('button[id^="ApplicantForm:representativesViewPanel:"]')]
        const repEdits=()=>repButtons().filter(e=>e.id.endsWith(':editRep')||e.title==='Open/edit')
        const records=()=>representative?repEdits().length:this.state.document.querySelectorAll('button[id^="ApplicantForm:applicantViewPanel:"][id$=":editApp"]').length
        if(representative&&!repButtons().length&&this.state.document.getElementById('ApplicantForm:repBtn'))return{outcome:'retry',receipt:{ok:true,page:'application',reference}}
        if(!representative&&records()===index&&this.state.document.getElementById('ApplicantForm:showApplicantForm'))return{outcome:'retry',receipt:{ok:true,page:'application',reference,applicants:index}}
        const edit=representative?repEdits()[0]:this.state.document.getElementById(`ApplicantForm:applicantViewPanel:${index}:editApp`)
        if(records()!==index+1||!edit)return{outcome:'unknown'}
        edit.click();await this.state.settle();this.checkFailure()
        const expected={...(representative?{name:a.name}:{firstname:a.name}),address:a.address,cp:a.postalCode,city:a.city,state:a.region,country:a.country,email:command.op==='representative'?command.data.email:command.email,...(!representative?{nationality:country,domicile:country,establishment:country,residence:country,acp:country}:{})}
        const normal=(value?:string)=>(value??'').normalize('NFKC').trim().replace(/\s+/g,' ')
        const saveId=representative?'ApplicantForm:saveRepBtn':'ApplicantForm:saveAppBtn'
        const matches=!!this.state.document.getElementById(saveId)&&this.state.document.querySelector<HTMLInputElement>('#ApplicantForm input[type=radio][value=true]')?.checked===true&&Object.entries(expected).every(([key,value])=>{
          const field=this.state.document.getElementById(`ApplicantForm:${key}:input`) as HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement|null
          if(!field||typeof field.value!=='string')return false
          const fv=normal(field.value),ev=normal(value)
          if(key==='country'){
            return fv===ev||fv.startsWith(`${country} - `)||fv.endsWith(` - ${country}`)||[country,a.country].some(c=>c&&fv.toLowerCase()===c.toLowerCase())
          }
          if(['nationality','domicile','establishment','residence','acp'].includes(key)){
            return fv===ev||fv.startsWith(`${country} - `)||fv.endsWith(` - ${country}`)||fv.toLowerCase()===country.toLowerCase()
          }
          return fv===ev
        })
        const cancels=[...this.state.document.querySelectorAll<HTMLElement>('#ApplicantForm button')].filter(e=>e.textContent?.trim()==='Cancel')
        const cancel=this.state.document.getElementById(representative?'ApplicantForm:cancelRep':'ApplicantForm:cancelApp')??(representative&&cancels.length===1?cancels[0]:null)
        if(!cancel)return{outcome:'unknown'}
        cancel.click();await this.state.settle();this.checkFailure()
        if(!matches||this.state.document.getElementById(saveId)||records()!==index+1)return{outcome:'unknown'}
        const receipt=await this.call({op:'inspect'},reference)
        return receipt.ok&&receipt.reference===reference&&receipt.page==='application'&&(representative||receipt.applicants===index+1)?{outcome:'completed',receipt}:{outcome:'unknown'}
      }
      if(['description','publication','signature'].includes(command.op)){
        if(!checkpoint.planKey||checkpoint.status!=='uncertain')return{outcome:'unknown'}
        await this.resume(reference);await this.remote('refreshOptionsUI')
        const form={description:'DescriptionForm',publication:'PublicationForm',signature:'signForm'}[command.op as 'description'|'publication'|'signature']
        // These setters replace a singular value and never allocate a record.
        return this.state.document.getElementById(form)?{outcome:'retry',receipt:{ok:true,page:'application',reference}}:{outcome:'unknown'}
      }
      if(command.op==='print'){
        if(!checkpoint.summaryKey||!checkpoint.planKey)return{outcome:'unknown'}
        await this.resume(reference)
        const summary=await this.call({op:'summary'},reference)
        return summary.ok&&summary.reference===reference&&summary.summaryKey===checkpoint.summaryKey?{outcome:'retry',receipt:summary}:{outcome:'unknown'}
      }
      if(command.op==='closeDesign'){
        if(!checkpoint.planKey||checkpoint.status!=='uncertain'||!Number.isSafeInteger(command.index)||command.index!<0||!Number.isSafeInteger(command.count)||command.count!<1||!command.subclass||!command.product)return{outcome:'unknown'}
        await this.resume(reference);await this.remote('refreshDesignUI')
        return inspectDesignRecovery(this.state.document,{op:'design',index:command.index!,subclass:command.subclass,product:command.product},reference,command.count)
      }
      if(command.op==='saveDraft'){
        const ack=checkpoint.acknowledged
        if(ack?.next!==checkpoint.next||ack.op!=='saveDraft'||ack.page!=='portfolio'){
          if(!checkpoint.planKey||!checkpoint.summaryKey)return{outcome:'unknown'}
          await this.resume(reference)
          const summary=await this.call({op:'summary'},reference)
          if(!summary.ok||summary.page!=='summary'||summary.reference!==reference||summary.summaryKey!==checkpoint.summaryKey)return{outcome:'unknown'}
          const back=await this.call({op:'backToApplication'},reference)
          // No fields are replayed. Re-close only the exact draft whose persisted
          // Summary is identical to the one already verified and printed.
          return back.ok&&back.page==='application'&&back.reference===reference?{outcome:'retry',receipt:{...back,summaryKey:summary.summaryKey}}:{outcome:'unknown'}
        }
        await this.initialize()
        const tab=[...this.state.document.querySelectorAll<HTMLButtonElement>('#quickSearchPanel button')].find(e=>/^Draft\(s\)/.test(e.textContent?.trim()??''))
        if(!tab)return{outcome:'unknown'}
        tab.click();await this.state.settle()
        const receipt=await this.call({op:'inspect'},reference)
        return receipt.ok&&receipt.draftSaved?{outcome:'completed',receipt:{...receipt,reference}}:{outcome:'unknown'}
      }
      if(command.op==='upload'){
        if(checkpoint.status!=='uncertain'||!checkpoint.planKey||!/^\d+\.\d+\.(?:jpe?g|tiff?)$/i.test(command.name))return{outcome:'unknown'}
        await this.resume(reference);await this.remote('refreshDesignUI')
        const index=Number(command.name.split('.')[0])-1
        const opened=await this.call({op:'openDesign',index},reference)
        if(!opened.ok)return{outcome:'unknown'}
        const total=this.reproCount(),config=this.widget('DataTable','designForm:reproDT',true),rows=config?.paginator?.rows
        if(!Number.isSafeInteger(rows)||!rows||rows<1)return{outcome:'unknown'}
        if(command.count>=rows)await this.state.post({source:'designForm:reproDT',form:'designForm',process:'designForm:reproDT',update:'designForm:reproDT',params:{'designForm:reproDT_pagination':'true','designForm:reproDT_first':String(Math.floor(command.count/rows)*rows),'designForm:reproDT_rows':String(rows),'designForm:reproDT_skipChildren':'true','designForm:reproDT_encodeFeature':'true'}})
        return inspectUploadRecovery(this.state.document,command,reference,total)
      }
      if(command.op==='legend'){
        if(checkpoint.status!=='uncertain'||!checkpoint.planKey||!/^\d+\.\d+\.(?:jpe?g|tiff?)$/i.test(command.name))return{outcome:'unknown'}
        await this.resume(reference);await this.remote('refreshDesignUI')
        const opened=await this.call({op:'openDesign',index:Number(command.name.split('.')[0])-1},reference)
        if(!opened.ok)return{outcome:'unknown',diagnosticError:opened.diagnosticError}
        const config=this.widget('DataTable','designForm:reproDT'),rows=config?.paginator?.rows
        const count=Number(command.name.split('.')[1])-1
        if(rows&&count>=rows)await this.state.post({source:'designForm:reproDT',form:'designForm',process:'designForm:reproDT',update:'designForm:reproDT',params:{'designForm:reproDT_pagination':'true','designForm:reproDT_first':String(Math.floor(count/rows)*rows),'designForm:reproDT_rows':String(rows),'designForm:reproDT_skipChildren':'true','designForm:reproDT_encodeFeature':'true'}})
        const matches=[...this.state.document.querySelectorAll<HTMLTableRowElement>('[id="designForm:reproDT_data"] tr[data-ri]')].filter(row=>row.cells[2]?.textContent?.trim()===command.name)
        // Replacing a single named legend is idempotent; it cannot add a file.
        return matches.length===1?{outcome:'retry',receipt:{ok:true,page:'application',reference}}:{outcome:'unknown'}
      }
      if(command.op==='creator'){
        if(checkpoint.status!=='uncertain'||!checkpoint.planKey||!Number.isSafeInteger(command.index)||command.index<0)return{outcome:'unknown'}
        await this.resume(reference);await this.remote('refreshOptionsUI')
        const form=this.state.document.getElementById('CreatorForm')
        if(!form)return{outcome:'unknown'}
        const records=()=>[...this.state.document.querySelectorAll<HTMLElement>('#CreatorForm button[title="Open/edit"],#CreatorForm button[id$=":editCre"]')]
        const count=records().length,receipt={ok:true,page:'application' as const,reference,creators:count}
        if(count===command.index&&form.querySelector('button[id$=":addCreator"]'))return{outcome:'retry',receipt}
        if(count!==command.index+1)return{outcome:'unknown'}
        records()[command.index].click();await this.state.settle();this.checkFailure()
        const a=command.address,expected={name:command.givenName,lastname:command.familyName,address:a.address,cp:a.postalCode,city:a.city,state:a.region,country:a.country}
        const normal=(value:string)=>value.normalize('NFKC').trim().replace(/\s+/g,' ')
        const matches=Object.entries(expected).every(([key,value])=>{
          const field=this.state.document.getElementById(`CreatorForm:${key}:input`) as HTMLInputElement|null
          if(!field)return false
          const actual=normal(field.value),target=normal(value)
          return actual===target||key==='country'&&/^[A-Z]{2}$/.test(target)&&actual.startsWith(`${target} - `)
        })
        const associations=[...this.state.document.querySelectorAll<HTMLInputElement>('#CreatorForm input[type=checkbox]')]
        const associated=associations.length>0&&associations.every(box=>box.checked)
        const cancel=[...this.state.document.querySelectorAll<HTMLButtonElement>('#CreatorForm button')].filter(button=>button.textContent?.trim()==='Cancel')
        if(cancel.length!==1)return{outcome:'unknown'}
        cancel[0].click();await this.state.settle();this.checkFailure()
        return matches&&associated&&!this.state.document.getElementById('CreatorForm:name:input')&&records().length===count?{outcome:'completed',receipt}:{outcome:'unknown'}
      }
      if(command.op==='design'){
        if(checkpoint.status!=='uncertain'||!checkpoint.planKey)return{outcome:'unknown'}
        await this.resume(reference)
        await this.remote('refreshDesignUI')
        const result=inspectDesignRecovery(this.state.document,command,reference)
        if(result.outcome!=='completed')return result
        const opened=await this.call({op:'openDesign',index:command.index},reference)
        if(!opened.ok||!this.state.document.getElementById('designForm:fileuploader:fileupload_input'))return{outcome:'unknown'}
        return{outcome:'completed',receipt:opened}
      }
      if(!['priority','parties','locarno'].includes(command.op))return{outcome:'unknown'}
      await this.resume(reference)
      if(command.op==='priority'){
        await this.remote('refreshOptionsUI')
        return inspectPriorityRecovery(this.state.document,command,reference)
      }
      if(command.op==='parties'){
        await this.remote('refreshDesignationUI')
        const change=this.state.document.getElementById('Designationform:desPanel:changeDesignationsSelection')
        if(!change)return{outcome:'unknown'}
        change.click();await this.state.settle();this.checkFailure()
        const boxes=[...this.state.document.querySelectorAll<HTMLInputElement>('#Designationform input[type=checkbox]')]
        if(!boxes.length)return{outcome:'unknown'}
        const selected=boxes.filter(e=>e.checked).map(e=>/value:\s*'([A-Z]{2})'/.exec(e.getAttribute('onclick')??'')?.[1])
        if(selected.some(code=>!code))return{outcome:'unknown'}
        return{outcome:selected.length===command.codes.length&&selected.every(code=>command.codes.includes(code!))?'completed':'retry',receipt:{ok:true,reference,page:'application'}}
      }
      if(command.op==='locarno'){
        await this.remote('refreshDesignUI')
        const input=this.state.document.getElementById('locarnoClassForm:locClass:input') as HTMLSelectElement|null
        if(!input)return{outcome:'unknown'}
        return{outcome:Number(input.value)===Number(command.value)?'completed':'retry',receipt:{ok:true,reference,page:'application'}}
      }
      return{outcome:'unknown'}
    }catch(error){return{outcome:'unknown',reason:'原站回执暂无法确认，保留检查点等待核对。',diagnosticError:normalizeDiagnosticError(error,{errorCode:'BUSINESS_UNCONFIRMED',errorStage:'business'},this.state.trace).diagnostic}}
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
      const config=table?this.widget('DataTable',table.id,true):undefined
      const rows=config?.paginator?.rows,count=config?.paginator?.rowCount
      if(table){
        if(!Number.isSafeInteger(rows)||!rows||rows<0||!Number.isSafeInteger(count)||count===undefined||count<0||count>10000)throw unsupported()
        for(let first=0;first<count&&!row;first+=rows){
          await this.state.post({source:table.id,form:'portfolio',process:table.id,update:table.id,params:{[`${table.id}_pagination`]:'true',[`${table.id}_first`]:String(first),[`${table.id}_rows`]:String(rows),[`${table.id}_skipChildren`]:'true',[`${table.id}_encodeFeature`]:'true'}})
          row=findRow()
        }
      }
    }
    return row
  }
  private widget(type:'DataTable'|'FileUpload',componentId:string,required=false):AstCall|undefined{
    const reports=[...this.state.document.scripts].map(script=>{const text=script.textContent??'';let cached=this.widgetReports.get(script);if(!cached||cached.text!==text){cached={text,report:analyzeJavaScript(text)};this.widgetReports.set(script,cached)}if(isDiagnosticModeEnabled()&&cached.emittedTrace!==this.state.trace?.traceId){this.reportAnalysis(cached.report);cached.emittedTrace=this.state.trace?.traceId}return cached.report})
    if(reports.some(r=>r.calls.some(c=>c.kind==='PrimeFaces.cw'&&((c.widgetType===type&&!c.componentId)||(c.componentId===componentId&&c.widgetType!==type)))))throw unsupported()
    const matches=reports.flatMap(r=>r.calls.filter(c=>c.kind==='PrimeFaces.cw'&&c.widgetType===type&&c.componentId===componentId).map(call=>({call,report:r})))
    if(matches.length!==1){if(required||matches.length>1)throw unsupported();return undefined}
    const {call,report}=matches[0]
    if(report.unresolved.length||call.confidence!=='static'||[call.process,call.update].includes('[redacted]'))throw unsupported()
    return call
  }
  private async remote(name:string,params?:Record<string,string>):Promise<void>{
    const action=jsfAction(`${name}(${JSON.stringify(Object.entries(params??{}).map(([name,value])=>({name,value})))})`,this.state.document.createElement('button'),this.state.document,report=>this.reportAnalysis(report))
    if(!action)throw unsupported()
    await this.state.post({...action,params,analysis:action.analysis})
  }
  private reproCount():number{
    const config=this.widget('DataTable','designForm:reproDT')
    if(config){const count=config.paginator?.rowCount;if(!Number.isSafeInteger(count)||count===undefined||count<0||count>10000)throw unsupported();return count}
    return this.state.document.getElementById('designForm:reproDT_data')?.querySelectorAll('tr[data-ri]').length??0
  }
  private async upload(command:Extract<DraftCommand,{op:'upload'}>):Promise<void>{
    if(this.reproCount()!==command.count)throw new Error('本接口链图纸计数不符，未重复上传。')
    if(!/^\d+\.\d+\.(?:jpe?g|tiff?)$/i.test(command.name)||!['image/jpeg','image/tiff'].includes(command.mime))throw new Error('接口图纸名称或类型无效。')
    const bytes=Uint8Array.from(atob(command.base64),c=>c.charCodeAt(0))
    if(bytes.length>2097152)throw new Error('图纸超过 2MB。')
    const input=this.state.document.getElementById('designForm:fileuploader:fileupload_input') as HTMLInputElement|null
    if(!input)throw new Error('本链上传控件缺失。')
    const source=input.id.replace(/_input$/,''),config=this.widget('FileUpload',source,true)!
    const process=config.process,update=config.update
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
      return {...snapshot,documentId:this.state.id,...(snapshot.page==='summary'?{summaryKey:summaryEvidenceKey(this.state.document)}:{}),...(result.warnings?{warnings:result.warnings}:{})}
    }catch(error){if(error instanceof HagueDiagnosticError&&this.state.trace)error.diagnostic.traceId=this.state.trace.traceId;this.commandFailure=error instanceof Error?error:new Error('接口链结果待核对');throw this.commandFailure}finally{this.running=false}
  }
}
