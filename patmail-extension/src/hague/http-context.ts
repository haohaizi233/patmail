import type {TraceContext,TraceEvent} from './diagnostics/trace'
import {emitTrace,isDiagnosticModeEnabled} from './diagnostics/store'
import {HagueDiagnosticError,normalizeDiagnosticError} from './diagnostics/errors'
import {structuralSnapshot,structureDiff,xmlEvidence} from './diagnostics/protocol'
import { HAGUE_ORIGIN } from './session-contract'
import { PermitPool } from '../utils/permit-pool'
const network=new PermitPool(6)

export interface JsfAction { source:string; form?:string; process?:string; update?:string; event?:string; params?:Record<string,string>; full?:boolean; analysis?:{scriptHash?:string;fingerprint?:string;callType?:string;line?:number;column?:number;confidence?:string} }
export type HagueFetch=(url:string,init?:RequestInit,trace?:TraceContext,requestId?:string)=>Promise<Response>
const protectedUrl=(raw:string,base=HAGUE_ORIGIN)=>{
  const url=new URL(raw,base)
  if(url.origin!==HAGUE_ORIGIN||!url.pathname.startsWith('/HagueEFilingWeb/protected/'))throw new Error('接口地址必须是 eHague 官方受保护路径。')
  return url
}

/** Per-chain response document and view state. No actual browser DOM is modified. */
export class HagueHttpContext {
  readonly document=new DOMParser().parseFromString('<html><head></head><body></body></html>','text/html')
  readonly location={origin:HAGUE_ORIGIN,pathname:'/HagueEFilingWeb/protected/portfolioManager.xhtml'}
  url=new URL(this.location.pathname,HAGUE_ORIGIN).href
  reference?:string
  pending=0
  failure?:Error
  trace?:TraceContext
  private requestId?:string
  private observedStatus:number|null=null
  private observedProtocol='not_observed'
  diagnosticState(){return{httpStatus:this.observedStatus,protocolStatus:this.observedProtocol,transportStatus:this.observedStatus===null?'not_dispatched':'completed'}}
  setTrace(trace?:TraceContext):void{this.trace=trace}
  private viewState=''
  private tail:Promise<unknown>=Promise.resolve()
  constructor(readonly id:string,private readonly fetcher:HagueFetch=(url,init)=>fetch(url,init)){}
  private async fetchComplete(url:string,init:RequestInit):Promise<Response>{
    return network.run(async()=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000)
      const requestId='req-'+crypto.randomUUID(),started=performance.now()
      this.requestId=requestId;this.observedStatus=null;this.observedProtocol='not_observed'
      emitTrace(this.trace,'request.dispatched',{requestId,httpMethod:init.method==='POST'?'POST':'GET',urlPath:url,httpStatus:null,transportStatus:'dispatched',businessStatus:'unknown',sideEffectMayHaveOccurred:init.method==='POST'})
      try{
        const response=await this.fetcher(url,{...init,signal:controller.signal},this.trace,requestId)
        this.observedStatus=response.status
        emitTrace(this.trace,'http.response',{requestId,httpMethod:init.method==='POST'?'POST':'GET',urlPath:response.url||url,httpStatus:response.status,transportStatus:'completed',responseType:/xml/i.test(response.headers.get('content-type')??'')?'xml':/html/i.test(response.headers.get('content-type')??'')?'html':/json/i.test(response.headers.get('content-type')??'')?'json':'unknown',businessStatus:'unknown',durationMs:performance.now()-started,evidenceCodes:['HTTP_RESPONSE_OBSERVED']})
        if(response.url)try{protectedUrl(response.url,url)}catch{throw new HagueDiagnosticError({errorCode:'AUTH_REDIRECT',errorStage:'http',httpStatus:response.status,traceId:this.trace?.traceId})}
        const text=await response.text(),buffered=new Response(text,{status:response.status,headers:response.headers})
        Object.defineProperty(buffered,'url',{value:response.url})
        emitTrace(this.trace,'request.finished',{requestId,httpStatus:response.status,transportStatus:'completed',businessStatus:'unknown',durationMs:performance.now()-started})
        return buffered
      }catch(error){
        const timeout=controller.signal.aborted,aborted=error instanceof DOMException&&error.name==='AbortError'
        const failure=normalizeDiagnosticError(error,{errorCode:timeout?'NETWORK_TIMEOUT':aborted?'NETWORK_ABORTED':'NETWORK_FAILED',errorStage:'transport',httpStatus:this.observedStatus,transportStatus:timeout?'timeout':aborted?'aborted':'network_error',sideEffectMayHaveOccurred:init.method==='POST'},this.trace)
        emitTrace(this.trace,'step.uncertain',{...failure.diagnostic,requestId,durationMs:performance.now()-started})
        throw failure
      }finally{clearTimeout(timer)}
    })
  }
  async settle():Promise<void>{await this.tail;if(this.failure)throw this.failure}
  load(html:string,path:string):void {
    const url=protectedUrl(path,this.url),next=new DOMParser().parseFromString(html,'text/html')
    const ref=/WIPO reference\s+(\d+)/i.exec(next.title+' '+next.body.textContent)?.[1]
    if(this.reference&&ref&&this.reference!==ref)throw new Error('响应 WIPO reference 与本链不同，已阻止交叉污染。')
    this.reference=ref??this.reference
    this.document.documentElement.innerHTML=next.documentElement.innerHTML
    this.viewState=this.document.querySelector<HTMLInputElement>('input[name="javax.faces.ViewState"]')?.value??''
    this.url=url.href;this.location.pathname=url.pathname
  }
  set(id:string,value:string):void {
    const field=this.document.getElementById(id) as HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement|null
    if(!field)throw new Error(`接口控件缺失：${id}`)
    field.value=value
  }
  private async read(response:Response):Promise<void> {
    if(!response.ok)throw new HagueDiagnosticError({errorCode:`HTTP_${response.status}`,errorStage:'http',httpStatus:response.status,traceId:this.trace?.traceId})
    if(response.url)protectedUrl(response.url,this.url)
    const text=await response.text()
    if(!text.trim())throw new HagueDiagnosticError({errorCode:'EMPTY_RESPONSE',errorStage:'protocol',httpStatus:response.status,protocolStatus:'empty',traceId:this.trace?.traceId})
    const mime=response.headers.get('content-type')??''
    if(mime&&!/html|xml|text\/plain/i.test(mime))throw new HagueDiagnosticError({errorCode:'INVALID_MIME',errorStage:'protocol',httpStatus:response.status,protocolStatus:'invalid_mime',traceId:this.trace?.traceId})
    const before=isDiagnosticModeEnabled()?structuralSnapshot(this.document,this.location.pathname,!!this.reference):undefined,oldViewState=this.viewState
    if(!/<partial-response[\s>]/.test(text)){
      if(/<\?xml|^\s*<partial-response/i.test(text))throw new HagueDiagnosticError({errorCode:'INVALID_XML',errorStage:'protocol',httpStatus:response.status,protocolStatus:'invalid_xml',traceId:this.trace?.traceId})
      this.observedProtocol='html';this.load(text,response.url||this.url);this.recordDom(before,oldViewState,response.status,'html');return
    }
    const xml=new DOMParser().parseFromString(text,'application/xml')
    const evidence=xmlEvidence(xml)
    this.observedProtocol=evidence.parserError?'invalid_xml':evidence.jsfError?'jsf_error':evidence.validationFailed?'jsf_validation_failed':'valid'
    emitTrace(this.trace,'jsf.parsed',{...evidence,requestId:this.requestId,httpStatus:response.status,protocolStatus:evidence.parserError?'invalid_xml':evidence.jsfError?'jsf_error':evidence.validationFailed?'jsf_validation_failed':'valid',businessStatus:'unknown'})
    if(evidence.parserError||evidence.jsfError)throw new HagueDiagnosticError({errorCode:evidence.parserError?'INVALID_XML':'JSF_ERROR',errorStage:'protocol',httpStatus:response.status,protocolStatus:evidence.parserError?'invalid_xml':'jsf_error',traceId:this.trace?.traceId})
    if(evidence.insertCount||evidence.deleteCount)throw new HagueDiagnosticError({errorCode:'PROTOCOL_UNSUPPORTED',errorStage:'protocol',httpStatus:response.status,protocolStatus:'unsupported',traceId:this.trace?.traceId})
    let missing=0
    const redirect=xml.querySelector('redirect')?.getAttribute('url')
    if(redirect){await this.get(redirect);return}
    for(const update of xml.querySelectorAll('update')){
      const id=update.id,content=update.textContent??''
      if(/javax.faces.ViewState/.test(id)){
        this.viewState=content
      }else if(id==='javax.faces.ViewRoot'){this.load(content,this.url)}
      else{
        const existing=this.document.getElementById(id)
        const tableBody=this.document.getElementById(`${id}_data`)
        // PrimeFaces DataTable pagination returns rows, not its outer widget.
        if(tableBody?.tagName==='TBODY'&&/^\s*(?:<tr\b|$)/i.test(content))tableBody.innerHTML=content
        else if(existing)existing.outerHTML=content
        else missing++
      }
    }
    for(const form of this.document.forms){
      let input=form.querySelector<HTMLInputElement>('input[name="javax.faces.ViewState"]')
      if(!input){input=this.document.createElement('input');input.type='hidden';input.name='javax.faces.ViewState';form.append(input)}
      input.value=this.viewState
    }
    this.recordDom(before,oldViewState,response.status,'valid',{unknownComponentCount:missing,updatedComponents:evidence.updatedComponents})
    if(missing)throw new HagueDiagnosticError({errorCode:'DOM_TARGET_MISSING',errorStage:'protocol',httpStatus:response.status,protocolStatus:'unsupported',traceId:this.trace?.traceId})
    if(evidence.validationFailed)throw new HagueDiagnosticError({errorCode:'JSF_VALIDATION_FAILED',errorStage:'protocol',httpStatus:response.status,protocolStatus:'jsf_validation_failed',businessStatus:'rejected',certainty:'rejected',traceId:this.trace?.traceId})
    // Only statically quoted official navigation is recognized; never eval server scripts.
    for(const script of xml.querySelectorAll('eval')){
      const target=/(?:window\.)?location(?:\.href)?\s*=\s*['"]([^'"]+)['"]/.exec(script.textContent??'')?.[1]
      if(target){await this.get(target);return}
    }
    const ref=/WIPO reference\s+(\d+)/i.exec(this.document.title+' '+this.document.body.textContent)?.[1]
    if(this.reference&&ref&&this.reference!==ref)throw new Error('响应 WIPO reference 与本链不同，已阻止交叉污染。')
    this.reference=ref??this.reference
    for(const extension of xml.querySelectorAll('extension')){
      let args:unknown
      try{args=JSON.parse(extension.textContent??'')}catch{continue}
      if(args&&typeof args==='object'&&'validationFailed'in args&&args.validationFailed===true)throw new HagueDiagnosticError({errorCode:'JSF_VALIDATION_FAILED',errorStage:'protocol',httpStatus:response.status,protocolStatus:'jsf_validation_failed',businessStatus:'rejected',certainty:'rejected',traceId:this.trace?.traceId})
    }
  }
  private recordDom(before:ReturnType<typeof structuralSnapshot>|undefined,oldViewState:string,status:number,protocolStatus:string,extra:Partial<TraceEvent>={}):void{
    if(!before)return
    try{const after=structuralSnapshot(this.document,this.location.pathname,!!this.reference);emitTrace(this.trace,'dom.updated',{requestId:this.requestId,httpStatus:status,protocolStatus,businessStatus:'unknown',before,after,diff:structureDiff(before,after),viewStateChanged:oldViewState!==this.viewState,viewStateLength:this.viewState.length,viewStatePresent:!!this.viewState,domEvidenceSource:'application_model',domStatus:structureDiff(before,after).length?'model_changed':'model_unchanged',domReplaced:true,...extra})}catch{/* Diagnostics are optional. */}
  }
  async get(path=this.url):Promise<void> {
    const url=protectedUrl(path,this.url)
    await this.read(await this.fetchComplete(url.href,{method:'GET',credentials:'include',cache:'no-store'}))
    if(!this.document.querySelector('input[name="javax.faces.ViewState"]'))throw new Error('接口未返回有效 JSF ViewState，需重新验证登录。')
  }
  controls(form:HTMLFormElement):URLSearchParams {
    const body=new URLSearchParams()
    for(const field of form.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>('input,select,textarea')){
      if(!field.name||field.disabled||/^(button|submit|reset|file)$/.test(field.type)||/^(checkbox|radio)$/.test(field.type)&&!(field as HTMLInputElement).checked)continue
      if(field instanceof HTMLSelectElement&&field.multiple)for(const option of field.selectedOptions)body.append(field.name,option.value)
      else body.append(field.name,field.value)
    }
    if(this.viewState)body.set('javax.faces.ViewState',this.viewState)
    return body
  }
  post(action:JsfAction,upload?:{field:string;file:File}):Promise<void> {
    this.pending++
    const task=this.tail.then(async()=>{
      if(this.failure)throw new Error('本链请求结果待核对，禁止自动重试。')
      const source=this.document.getElementById(action.source)
      const form=(action.form?this.document.getElementById(action.form):source?.closest('form')) as HTMLFormElement|null
      if(!form)throw new Error(`接口表单缺失：${action.source}`)
      emitTrace(this.trace,'request.prepared',{sourceComponent:action.source,form:form.id,process:action.process,update:action.update,event:action.event,parameterNames:Object.keys(action.params??{}),httpMethod:'POST',businessStatus:'pending'})
      if(action.analysis)emitTrace(this.trace,'protocol.analyzed',{astCallType:action.analysis.callType,protocolFingerprint:action.analysis.fingerprint,astConfidence:action.analysis.confidence,sourceLocation:{scriptHash:action.analysis.scriptHash,line:action.analysis.line,column:action.analysis.column},evidenceCodes:['PROTOCOL_STATIC']})
      const body=this.controls(form)
      if(!action.full){
        body.set('javax.faces.partial.ajax','true');body.set('javax.faces.source',action.source)
        body.set('javax.faces.partial.execute',action.process??'@all')
        if(action.update)body.set('javax.faces.partial.render',action.update)
        if(action.event){body.set('javax.faces.behavior.event',action.event);body.set('javax.faces.partial.event',action.event)}
        else if(!upload)body.set(action.source,action.source)
      }else body.set(action.source,action.source)
      for(const [key,value]of Object.entries(action.params??{}))body.set(key,value)
      const url=protectedUrl(form.getAttribute('action')||this.url,this.url)
      let payload:BodyInit=body.toString()
      if(upload){const multipart=new FormData();for(const[k,v]of body)multipart.append(k,v);multipart.append(upload.field,upload.file,upload.file.name);payload=multipart}
      await this.read(await this.fetchComplete(url.href,{method:'POST',credentials:'include',headers:{...(upload?{}:{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8'}),...(action.full?{}:{'Faces-Request':'partial/ajax','X-Requested-With':'XMLHttpRequest'})},body:payload}))
    }).catch((error:unknown)=>{this.failure=error instanceof Error?error:new Error('接口操作结果待核对');throw this.failure}).finally(()=>{this.pending--})
    this.tail=task.catch(()=>{})
    return task
  }
}
