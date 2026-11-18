import type {HagueFetch} from './http-context'
import {HagueDiagnosticError} from './diagnostics/errors'
import {downloadSummaryPdf,findSummaryDownload} from './summary-download'
import type {TraceContext} from './diagnostics/trace'
const origin='https://hague.wipo.int'
/** Submit the official, response-derived Preview reproductions control; never guess a JSF ID. */
export async function readReproductionsPdf(doc:Document,pageUrl:string,reference:string,caseVolume:string,fetcher:HagueFetch,signal?:AbortSignal,controls?:URLSearchParams){
 if(!/^P[A-Z0-9-]*HAGUE$/i.test(caseVolume)||!/^\d+$/.test(reference)||new URL(pageUrl).origin!==origin||!/\/application\.xhtml$/.test(new URL(pageUrl).pathname)||/WIPO reference\s+(\d+)/i.exec(doc.title+' '+doc.body.textContent)?.[1]!==reference)throw new Error('图纸导出案件或页面不匹配。')
 const buttons=[...doc.querySelectorAll<HTMLButtonElement>('button[type="submit"]')].filter(b=>b.textContent?.trim()==='Preview reproductions'&&!b.disabled)
 if(buttons.length!==1)throw new Error('未找到唯一的 Preview reproductions 控件。')
 const button=buttons[0],form=button.form
 if(!form||form.id!=='designForm'||!button.name||form.method.toLowerCase()!=='post')throw new Error('图纸预览表单无效。')
 const url=new URL(form.getAttribute('action')||pageUrl,pageUrl)
 if(url.origin!==origin||url.pathname!=='/HagueEFilingWeb/protected/page/application.xhtml')throw new Error('图纸预览地址无效。')
 const body=controls?new URLSearchParams(controls):new URLSearchParams()
 if(!controls)for(const [key,value]of new FormData(form)){if(typeof value==='string')body.append(key,value)}
 if(!body.get('javax.faces.ViewState'))throw new Error('图纸预览缺少有效 ViewState。')
 body.set(button.name,button.value||'')
 const response=await fetcher(url.href,{method:'POST',body,credentials:'include',signal})
 if(!response.ok||response.url&&new URL(response.url).origin!==origin||!/^application\/pdf(?:;|$)/i.test(response.headers.get('content-type')??''))throw new Error('原站未返回图纸 PDF，请核对登录和当前案件。')
 const bytes=new Uint8Array(await response.arrayBuffer())
 if(String.fromCharCode(...bytes.subarray(0,5))!=='%PDF-')throw new Error('图纸 PDF 内容无效。')
 return{name:`${caseVolume}-Reproductions-WIPO${reference}.pdf`,bytes}
}
export async function exportReproductions(doc:Document,url:string,reference:string,caseVolume:string,fetcher:HagueFetch,trace?:TraceContext,signal?:AbortSignal,controls?:URLSearchParams):Promise<number>{
 try{
  signal?.throwIfAborted()
  const name=`${caseVolume}-Reproductions-WIPO${reference}.pdf`
  const previous=await findSummaryDownload(name,trace?.caseRunId)
  if(previous!==undefined)return previous
  const pdf=await readReproductionsPdf(doc,url,reference,caseVolume,fetcher,signal,controls)
  signal?.throwIfAborted()
  return await downloadSummaryPdf(pdf,trace?.caseRunId)
 }catch(error){
  const failure=new HagueDiagnosticError({errorCode:'REPRODUCTIONS_EXPORT_FAILED',errorStage:'business',httpStatus:null,transportStatus:'not_dispatched',sideEffectMayHaveOccurred:false,traceId:trace?.traceId})
  failure.message=`图纸导出未完成，未进入 Summary：${error instanceof Error?error.message:'请检查下载列表。'}`
  throw failure
 }
}

/** A failed local export must not enter JSF recovery and skip the Summary prerequisite. */
export async function beforeSummaryExport(exporter:()=>Promise<unknown>,signal?:AbortSignal):Promise<void>{
 try{signal?.throwIfAborted();await exporter();signal?.throwIfAborted()}
 catch(error){const failure=new HagueDiagnosticError({errorCode:'REPRODUCTIONS_EXPORT_FAILED',errorStage:'business',httpStatus:null,transportStatus:'not_dispatched',sideEffectMayHaveOccurred:false});failure.message=error instanceof Error?error.message:'图纸导出未完成，未进入 Summary。';throw failure}
}
