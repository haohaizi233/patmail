import { PermitPool } from '../utils/permit-pool'
const printer=new PermitPool(1)
export async function printOfflineHague(html:string,caseVolume:string,reference:string,delivery:'download'|'artifact'='download'):Promise<number|{base64:string;fileName:string}>{
 if(!/^P[A-Z0-9-]*HAGUE$/i.test(caseVolume)||!/^\d+$/.test(reference)||html.length>20000000||/<(?:script|iframe|object|embed|base)\b|\son\w+\s*=|(?:src|href)\s*=\s*["']https?:|url\(\s*["']?https?:|@import/i.test(html))throw new Error('离线 Summary 内容或标识无效。')
 return printer.run(async()=>{
  const tab=await chrome.tabs.create({url:'about:blank',active:false});if(tab.id===undefined)throw new Error('无法创建离线打印上下文。')
  const target={tabId:tab.id};let attached=false
  try{
   await chrome.debugger.attach(target,'1.3');attached=true
   await chrome.debugger.sendCommand(target,'Network.enable')
   await chrome.debugger.sendCommand(target,'Network.setBlockedURLs',{urls:['http://*','https://*','file://*','ftp://*']})
   const tree=await chrome.debugger.sendCommand(target,'Page.getFrameTree') as {frameTree:{frame:{id:string}}}
   await chrome.debugger.sendCommand(target,'Page.setDocumentContent',{frameId:tree.frameTree.frame.id,html})
   const end=Date.now()+30000;let ready=false
   while(Date.now()<end){const r=await chrome.debugger.sendCommand(target,'Runtime.evaluate',{expression:'document.readyState === "complete" && [...document.images].every(i=>i.complete && i.naturalWidth>0) && document.fonts.status === "loaded"',returnByValue:true}) as {result?:{value?:boolean}};if(r.result?.value){ready=true;break}await new Promise(r=>setTimeout(r,100))}
   if(!ready)throw new Error('Summary 离线图片尚未完成解码。')
   const pdf=await chrome.debugger.sendCommand(target,'Page.printToPDF',{printBackground:true,preferCSSPageSize:true,displayHeaderFooter:false,transferMode:'ReturnAsBase64'}) as {data?:string}
   if(!pdf.data||!atob(pdf.data.slice(0,12)).startsWith('%PDF-'))throw new Error('未返回有效 Summary PDF。')
   if(delivery==='artifact')return{base64:pdf.data,fileName:`${caseVolume}-Summary-WIPO${reference}.pdf`}
   const id=await chrome.downloads.download({url:`data:application/pdf;base64,${pdf.data}`,filename:`PatMail/Hague/${caseVolume}/Summary-WIPO${reference}.pdf`,saveAs:false,conflictAction:'uniquify'})
   const deadline=Date.now()+60000
   while(Date.now()<deadline){const item=(await chrome.downloads.search({id}))[0];if(item?.state==='complete')return id;if(item?.state==='interrupted')throw new Error('Summary PDF 下载中断。');await new Promise(r=>setTimeout(r,250))}
   throw new Error('Summary PDF 下载尚未确认完成。')
  }finally{if(attached)await chrome.debugger.detach(target).catch(()=>{});await chrome.tabs.remove(tab.id).catch(()=>{})}
 })
}
