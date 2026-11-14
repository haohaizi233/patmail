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
it('accepts real large Chrome tab IDs without weakening business row-index limits',async()=>{
 const h=host(),handle=createHagueDraftHandler(h)
 expect(await handle({channel,tabId:449092488,command:{op:'inspect'}},sender)).toMatchObject({ok:true})
 expect(h.getTab).toHaveBeenCalledWith(449092488)
 expect(await handle({channel,tabId:-1,command:{op:'inspect'}},sender)).toMatchObject({ok:false})
})
it('claims a tab before the first asynchronous check and retains ownership after a rejected duplicate',async()=>{
 const h=host();let release!:()=>void
 h.getTab.mockImplementation(async()=>{await new Promise<void>(r=>{release=r});return{url:'https://hague.wipo.int/HagueEFilingWeb/protected/page/application.xhtml'}})
 const handle=createHagueDraftHandler(h),message={channel,tabId:7,command:{op:'inspect'}}
 const first=handle(message,sender)
 // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- 存量豁免：外部 XML/JSON any 数据流，类型收口待后续
 expect(await handle(message,sender)).toMatchObject({ok:false,error:expect.stringContaining('未结束')})
 // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- 存量豁免：外部 XML/JSON any 数据流，类型收口待后续
 expect(await handle(message,sender)).toMatchObject({ok:false,error:expect.stringContaining('未结束')})
 release();expect(await first).toMatchObject({ok:true});expect(h.run).toHaveBeenCalledTimes(1)
},1000)
it('serializes the production inspect injection without an undefined optional reference',async()=>{
 const h=host(),injections:unknown[][]=[]
 vi.stubGlobal('chrome',{runtime:{id:'ext'},tabs:{get:h.getTab},webNavigation:{getFrame:async()=>({documentId:'doc-1'})},scripting:{executeScript:async(injection:{args:unknown[]})=>{
  injections.push(injection.args)
  if(injection.args.some(v=>v===undefined))throw new Error('Value is unserializable')
  return[{documentId:'doc-1',result:{ok:true,page:'portfolio'}}]
 }}})
 try{
  vi.resetModules();const {handleHagueDraftMessage}=await import('../../../src/background/hague-draft')
  expect(await handleHagueDraftMessage({channel,tabId:449092488,command:{op:'inspect'}},sender)).toMatchObject({ok:true})
  expect(injections[0]).toEqual([{op:'inspect'}])
  await handleHagueDraftMessage({channel,tabId:449092488,reference:'187867',command:{op:'inspect'}},sender)
  expect(injections[1]).toEqual([{op:'inspect'},'187867'])
 }finally{vi.unstubAllGlobals();vi.resetModules()}
})
