/** A short-lived print session, independent of the read-only CDP observer. Never changes download behavior. */
export async function printHagueSummary(tabId:number,documentId:string,reference:string,caseVolume:string):Promise<number> {
 if(!/^\d+$/.test(reference)||!/^P[A-Z0-9-]*HAGUE$/i.test(caseVolume))throw new Error('PDF 案件标识无效。')
 const target={tabId}
 let attached=false
 try{
  await chrome.debugger.attach(target,'1.3');attached=true
  const frame=await chrome.webNavigation.getFrame({tabId,frameId:0})
  if(frame?.documentId!==documentId||new URL(frame.url).origin!=='https://hague.wipo.int'||!frame.url.includes('/protected/page/summary.xhtml'))throw new Error('Summary 页面已变化，未生成 PDF。')
  const result:unknown=await chrome.debugger.sendCommand(target,'Page.printToPDF',{printBackground:true,preferCSSPageSize:true,displayHeaderFooter:false,transferMode:'ReturnAsBase64'})
  const after=await chrome.webNavigation.getFrame({tabId,frameId:0})
  if(after?.documentId!==documentId)throw new Error('打印期间页面已变化，PDF 未归档。')
  if(!result||typeof result!=='object'||!('data'in result)||typeof result.data!=='string'||!atob(result.data.slice(0,12)).startsWith('%PDF-'))throw new Error('浏览器未返回有效 PDF。')
  const downloadId=await chrome.downloads.download({url:`data:application/pdf;base64,${result.data}`,filename:`PatMail/Hague/${caseVolume}/Summary-WIPO${reference}.pdf`,saveAs:false,conflictAction:'uniquify'})
  const end=Date.now()+60000
  while(Date.now()<end){const item=(await chrome.downloads.search({id:downloadId}))[0];if(item?.state==='complete')return downloadId;if(item?.state==='interrupted')throw new Error('Summary PDF 保存被中断，请检查浏览器下载列表。');await new Promise(r=>setTimeout(r,250))}
  throw new Error('PDF 已发送至浏览器下载，但完成状态尚未确认。')
 }finally{if(attached)await chrome.debugger.detach(target).catch(()=>{})}
}
