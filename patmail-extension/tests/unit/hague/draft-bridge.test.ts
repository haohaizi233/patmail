import { expect, it, vi } from 'vitest'
import { createHagueDraftHandler } from '../../../src/background/hague-draft'
import { HAGUE_DRAFT_CHANNEL as channel } from '../../../src/hague/draft-contract'
const sender={id:'ext',url:'chrome-extension://ext/app.html'}
const host=()=>({extensionId:'ext',getTab:vi.fn(async()=>({url:'https://hague.wipo.int/HagueEFilingWeb/protected/page/application.xhtml'})),getDocumentId:vi.fn(async()=>'doc-1'),run:vi.fn(async()=>({documentId:'doc-1',result:{ok:true,reference:'123',page:'application'}}))})
it('rejects spoofed callers, wrong origins and unrecognized actions before injection',async()=>{
 const h=host(),handle=createHagueDraftHandler(h)
 const message={channel,tabId:7,command:{op:'inspect'}}
 expect(await handle(message,{...sender,url:'https://hague.wipo.int/'})).toMatchObject({ok:false})
 expect(await handle({...message,command:{op:'pay'}},sender)).toMatchObject({ok:false})
 h.getTab.mockResolvedValue({url:'https://hague.wipo.int.evil.test/'})
 expect(await handle(message,sender)).toMatchObject({ok:false})
 expect(h.run).not.toHaveBeenCalled()
})
it('pins writes to the inspected document and rejects navigation drift',async()=>{
 const h=host(),handle=createHagueDraftHandler(h)
 expect(await handle({channel,tabId:7,command:{op:'inspect'}},sender)).toMatchObject({ok:true,documentId:'doc-1'})
 expect(await handle({channel,tabId:7,documentId:'doc-old',command:{op:'signature',reference:'PO1HAGUE',representative:'CENFO'}},sender)).toMatchObject({ok:false})
 expect(h.run).toHaveBeenCalledTimes(1)
 expect(await handle({channel,tabId:7,command:{op:'create'}},sender)).toMatchObject({ok:false})
})
