/** A single generated Summary is already buffered. Chrome's download API does
 * not require the workspace to be controlled by a service worker. */
export const summaryDownloadKey=(name:string,caseRunId:string)=>`hague.summary.download.v1.${caseRunId}.${name}`
export async function findSummaryDownload(name:string,caseRunId?:string):Promise<number|undefined>{
 if(!caseRunId||!chrome.storage?.local)return undefined
 const key=summaryDownloadKey(name,caseRunId),record:unknown=(await chrome.storage.local.get(key))[key]
 if(!record||typeof record!=='object'||!('id'in record)||typeof record.id!=='number'||!Number.isSafeInteger(record.id)||record.id<0)return undefined
 const item=(await chrome.downloads.search({id:record.id}))[0]
 return item?.state==='complete'&&item.exists!==false?record.id:undefined
}
export async function downloadSummaryPdf(pdf:{name:string;bytes:Uint8Array},caseRunId?:string):Promise<number>{
 if(!/^P[A-Z0-9-]*HAGUE-Summary-WIPO\d+\.pdf$/i.test(pdf.name)||String.fromCharCode(...pdf.bytes.subarray(0,5))!=='%PDF-')throw new Error('Summary PDF 文件名或内容无效。')
 let binary=''
 for(let i=0;i<pdf.bytes.length;i+=32768)binary+=String.fromCharCode(...pdf.bytes.subarray(i,i+32768))
 const id=await chrome.downloads.download({url:`data:application/pdf;base64,${btoa(binary)}`,filename:pdf.name,saveAs:false,conflictAction:'uniquify'})
 if(caseRunId&&chrome.storage?.local)await chrome.storage.local.set({[summaryDownloadKey(pdf.name,caseRunId)]:{id}})
 return new Promise<number>((resolve,reject)=>{
  const deadline=Date.now()+60000
  let settled=false,timer:ReturnType<typeof setTimeout>|undefined
  const finish=(error?:Error)=>{if(settled)return;settled=true;clearTimeout(timer);chrome.downloads.onChanged?.removeListener(changed);if(error)reject(error);else resolve(id)}
  const changed=(delta:chrome.downloads.DownloadDelta)=>{
   if(delta.id!==id)return
   if(delta.state?.current==='complete')finish()
   else if(delta.state?.current==='interrupted')finish(new Error('Summary PDF 下载中断。'))
  }
  const check=async()=>{
   try{
    const item=(await chrome.downloads.search({id}))[0]
    if(settled)return
    if(item?.state==='complete'){finish();return}
    if(item?.state==='interrupted'){finish(new Error('Summary PDF 下载中断。'));return}
    if(Date.now()>=deadline){finish(new Error('Summary PDF 下载尚未确认，请核对浏览器下载列表。'));return}
    timer=setTimeout(()=>void check(),250)
   }catch(error){finish(error instanceof Error?error:new Error('Summary PDF 下载状态不可用。'))}
  }
  chrome.downloads.onChanged?.addListener(changed)
  void check()
 })
}
