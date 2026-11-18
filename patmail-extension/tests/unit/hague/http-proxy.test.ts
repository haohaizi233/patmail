import {expect,it,vi} from 'vitest'
import {handleHagueHttp} from '../../../src/background/hague-http'
import {printOfflineHague} from '../../../src/background/hague-offline-pdf'
it('rejects spoofed callers, foreign routes, cookie headers and writes to read-only assets',async()=>{
 const executeScript=vi.fn();vi.stubGlobal('chrome',{runtime:{id:'ext'},scripting:{executeScript}})
 const sender={id:'ext',url:'chrome-extension://ext/app.html'},request={url:'https://hague.wipo.int/HagueEFilingWeb/protected/page/application.xhtml',method:'GET'}
 try{
  for(const [r,s]of [[request,{...sender,url:'https://evil.test/app.html'}],[{...request,url:'https://evil.test/'},sender],[{...request,headers:{Cookie:'NO'}},sender],[{...request,url:'https://hague.wipo.int/HagueEFilingWeb/DesignServlet',method:'POST'},sender]] as const)expect(await handleHagueHttp({tabId:449092488,request:r},s)).toMatchObject({ok:false})
  expect(executeScript).not.toHaveBeenCalled()
 }finally{vi.unstubAllGlobals()}
})
it('rejects active or network-dependent print HTML before creating a render tab',async()=>{
 for(const html of ['<script>alert(1)</script>','<img src="https://evil.test/image">','<img src="data:image/png;base64,AA" onload="alert(1)">'])await expect(printOfflineHague(html,'PO1HAGUE','123')).rejects.toThrow(/无效/)
})
it('allows only the confirmed Summary Back action on the summary POST route',async()=>{
 const executeScript=vi.fn(async()=>[{result:{status:200,url:'https://hague.wipo.int/HagueEFilingWeb/protected/page/application.xhtml',mime:'text/html',base64:''}}])
 vi.stubGlobal('chrome',{runtime:{id:'ext'},tabs:{get:vi.fn(async()=>({url:'https://hague.wipo.int/'}))},webNavigation:{getFrame:vi.fn(async()=>({documentId:'doc'}))},scripting:{executeScript}})
 const sender={id:'ext',url:'chrome-extension://ext/app.html'},request={url:'https://hague.wipo.int/HagueEFilingWeb/protected/page/summary.xhtml',method:'POST',params:[['javax.faces.source','headerForm:back'],['javax.faces.partial.ajax','true'],['javax.faces.partial.execute','@all']]}
 try{
  expect(await handleHagueHttp({tabId:7,request},sender)).toMatchObject({ok:true})
  expect(await handleHagueHttp({tabId:7,request:{...request,params:[['javax.faces.source','otherAction']]}},sender)).toMatchObject({ok:false})
  expect(executeScript).toHaveBeenCalledOnce()
 }finally{vi.unstubAllGlobals()}
})
