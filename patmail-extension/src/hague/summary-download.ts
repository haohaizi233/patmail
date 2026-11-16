/** Use the native suggested filename before Chrome determines the target.
 * A data URL through downloads.download can lose its requested filename. */
export const summaryDownloadKey=(name:string,caseRunId:string)=>`hague.summary.download.v1.${caseRunId}.${name}`
function matchesName(filename:string|undefined,name:string):boolean{
 const base=filename?.split(/[\\/]/).pop()?.replace(/ \(\d+\)(?=\.pdf$)/i,'')
 return base?.toLowerCase()===name.toLowerCase()
}
async function startSummaryDownload(pdf:{name:string;bytes:Uint8Array}):Promise<{id:number;release:()=>void}>{
 const url=URL.createObjectURL(new Blob([new Uint8Array(pdf.bytes).buffer],{type:'application/pdf'}))
 const release=()=>URL.revokeObjectURL(url)
 try{
  const id=await new Promise<number>((resolve,reject)=>{
   const cleanup=()=>{clearTimeout(timer);chrome.downloads.onCreated.removeListener(created)}
   const created=(item:chrome.downloads.DownloadItem)=>{if(item.url===url){cleanup();resolve(item.id)}}
   const timer=setTimeout(()=>{cleanup();reject(new Error('浏览器未建立 Summary 下载记录。'))},60000)
   chrome.downloads.onCreated.addListener(created)
   const anchor=document.createElement('a');anchor.href=url;anchor.download=pdf.name;anchor.hidden=true
   try{document.body.append(anchor);anchor.click()}catch(error){cleanup();reject(error instanceof Error?error:new Error('Summary 下载未启动。'))}finally{anchor.remove()}
  })
  return{id,release}
 }catch(error){release();throw error}
}
export async function findSummaryDownload(name:string,caseRunId?:string):Promise<number|undefined>{
 if(!caseRunId||!chrome.storage?.local)return undefined
 const key=summaryDownloadKey(name,caseRunId),record:unknown=(await chrome.storage.local.get(key))[key]
 if(!record||typeof record!=='object'||!('id'in record)||typeof record.id!=='number'||!Number.isSafeInteger(record.id)||record.id<0)return undefined
 const item=(await chrome.downloads.search({id:record.id}))[0]
 return item?.state==='complete'&&item.exists!==false&&matchesName(item.filename,name)?record.id:undefined
}
export async function downloadSummaryPdf(pdf:{name:string;bytes:Uint8Array},caseRunId?:string):Promise<number>{
 if(!/^P[A-Z0-9-]*HAGUE-Summary-WIPO\d+\.pdf$/i.test(pdf.name)||String.fromCharCode(...pdf.bytes.subarray(0,5))!=='%PDF-')throw new Error('Summary PDF 文件名或内容无效。')
 const{id,release}=await startSummaryDownload(pdf)
 try{if(caseRunId&&chrome.storage?.local)await chrome.storage.local.set({[summaryDownloadKey(pdf.name,caseRunId)]:{id}})}catch(error){release();throw error}
 return new Promise<number>((resolve,reject)=>{
  const deadline=Date.now()+60000
  let settled=false,timer:ReturnType<typeof setTimeout>|undefined
  const finish=(error?:Error)=>{if(settled)return;settled=true;clearTimeout(timer);chrome.downloads.onChanged?.removeListener(changed);release();if(error)reject(error);else resolve(id)}
  const changed=(delta:chrome.downloads.DownloadDelta)=>{
   if(delta.id!==id)return
   if(delta.state?.current==='complete')void check()
   else if(delta.state?.current==='interrupted')finish(new Error('Summary PDF 下载中断。'))
  }
  const check=async()=>{
   try{
    const item=(await chrome.downloads.search({id}))[0]
    if(settled)return
    if(item?.state==='complete'){finish(matchesName(item.filename,pdf.name)?undefined:new Error('Summary 下载文件名与本案不一致。'));return}
    if(item?.state==='interrupted'){finish(new Error('Summary PDF 下载中断。'));return}
    if(Date.now()>=deadline){finish(new Error('Summary PDF 下载尚未确认，请核对浏览器下载列表。'));return}
    timer=setTimeout(()=>void check(),250)
   }catch(error){finish(error instanceof Error?error:new Error('Summary PDF 下载状态不可用。'))}
  }
  chrome.downloads.onChanged?.addListener(changed)
  void check()
 })
}
