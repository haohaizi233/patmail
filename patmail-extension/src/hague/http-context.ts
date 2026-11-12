import { HAGUE_ORIGIN } from './session-contract'
import { PermitPool } from '../utils/permit-pool'
const network=new PermitPool(6)

export interface JsfAction { source:string; form?:string; process?:string; update?:string; event?:string; params?:Record<string,string>; full?:boolean }
export type HagueFetch=(url:string,init?:RequestInit)=>Promise<Response>
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
  private viewState=''
  private tail:Promise<unknown>=Promise.resolve()
  constructor(readonly id:string,private readonly fetcher:HagueFetch=(url,init)=>fetch(url,init)){}
  private async fetchComplete(url:string,init:RequestInit):Promise<Response>{
    return network.run(async()=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000)
      try{
        const response=await this.fetcher(url,{...init,signal:controller.signal})
        if(response.url)protectedUrl(response.url,url)
        const text=await response.text(),buffered=new Response(text,{status:response.status,headers:response.headers})
        Object.defineProperty(buffered,'url',{value:response.url})
        return buffered
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
    if(!response.ok)throw new Error(`eHague HTTP ${response.status}`)
    if(response.url)protectedUrl(response.url,this.url)
    const text=await response.text()
    if(!/<partial-response[\s>]/.test(text)){this.load(text,response.url||this.url);return}
    const xml=new DOMParser().parseFromString(text,'application/xml')
    if(xml.querySelector('parsererror,error'))throw new Error(`JSF 响应错误：${xml.querySelector('error-name')?.textContent??'XML 无效'}`)
    const redirect=xml.querySelector('redirect')?.getAttribute('url')
    if(redirect){await this.get(redirect);return}
    for(const update of xml.querySelectorAll('update')){
      const id=update.id,content=update.textContent??''
      if(/javax.faces.ViewState/.test(id)){
        this.viewState=content
      }else if(id==='javax.faces.ViewRoot'){this.load(content,this.url)}
      else{
        const existing=this.document.getElementById(id)
        if(existing)existing.outerHTML=content
      }
    }
    for(const form of this.document.forms){
      let input=form.querySelector<HTMLInputElement>('input[name="javax.faces.ViewState"]')
      if(!input){input=this.document.createElement('input');input.type='hidden';input.name='javax.faces.ViewState';form.append(input)}
      input.value=this.viewState
    }
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
      if(args&&typeof args==='object'&&'validationFailed'in args&&args.validationFailed===true)throw new Error('原站 JSF 校验未通过，未确认保存；请核对本步骤必填字段。')
    }
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
