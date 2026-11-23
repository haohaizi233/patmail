import { expect,it,vi } from 'vitest'
import { printHagueSummary } from '../../../src/background/hague-pdf'
function host(){return {debugger:{attach:vi.fn(async()=>{}),detach:vi.fn(async()=>{}),sendCommand:vi.fn(async(_target:unknown,_method:string,_params:unknown)=>({data:btoa('%PDF-1.7\nfixture')}))},webNavigation:{getFrame:vi.fn(async()=>({documentId:'doc',url:'https://hague.wipo.int/HagueEFilingWeb/protected/page/summary.xhtml'}))},downloads:{download:vi.fn(async()=>10),search:vi.fn(async()=>[{state:'complete',filename:'C:/Downloads/PatMail/Hague/PO1HAGUE/Summary-WIPO123 (1).pdf'}])}}}
it('prints only the pinned Summary, preserves normal download behavior and always detaches',async()=>{
 const chromeHost=host();vi.stubGlobal('chrome',chromeHost)
 try{expect(await printHagueSummary(7,'doc','123','PO1HAGUE')).toBe(10);expect(chromeHost.debugger.sendCommand.mock.calls[0]?.[1]).toBe('Page.printToPDF');expect(chromeHost.downloads.download).toHaveBeenCalledWith(expect.objectContaining({filename:'PatMail/Hague/PO1HAGUE/Summary-WIPO123.pdf',saveAs:false}));expect(chromeHost.debugger.detach).toHaveBeenCalledOnce()}finally{vi.unstubAllGlobals()}
})
it('discards PDF when the document changes while printing',async()=>{
 const chromeHost=host();chromeHost.webNavigation.getFrame.mockResolvedValueOnce({documentId:'doc',url:'https://hague.wipo.int/HagueEFilingWeb/protected/page/summary.xhtml'}).mockResolvedValueOnce({documentId:'new',url:'https://hague.wipo.int/HagueEFilingWeb/protected/page/summary.xhtml'});vi.stubGlobal('chrome',chromeHost)
 try{await expect(printHagueSummary(7,'doc','123','PO1HAGUE')).rejects.toThrow('页面已变化');expect(chromeHost.downloads.download).not.toHaveBeenCalled();expect(chromeHost.debugger.detach).toHaveBeenCalledOnce()}finally{vi.unstubAllGlobals()}
})
it('does not accept a browser fallback name as a valid case archive',async()=>{
 const chromeHost=host();chromeHost.downloads.search.mockResolvedValueOnce([{state:'complete',filename:'C:/Downloads/download.pdf'}]);vi.stubGlobal('chrome',chromeHost)
 try{await expect(printHagueSummary(7,'doc','123','PO1HAGUE')).rejects.toThrow('文件名与本案不一致');expect(chromeHost.debugger.detach).toHaveBeenCalledOnce()}finally{vi.unstubAllGlobals()}
})
