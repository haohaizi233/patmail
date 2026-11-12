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
