import {it,expect,vi,afterEach} from 'vitest'
import {downloadSummaryPdf,findSummaryDownload,summaryDownloadKey} from '../../../src/hague/summary-download'
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals()})
it('confirms a PDF through Chrome downloads without requiring a page service-worker controller',async()=>{
 const download=vi.fn(async()=>42),search=vi.fn(async()=>[{id:42,state:'complete'}])
 vi.stubGlobal('chrome',{downloads:{download,search}})
 expect(await downloadSummaryPdf({name:'PO1HAGUE-Summary-WIPO123.pdf',bytes:new Uint8Array([37,80,68,70,45])})).toBe(42)
 expect(download).toHaveBeenCalledWith(expect.objectContaining({filename:'PO1HAGUE-Summary-WIPO123.pdf',saveAs:false}))
})
it('rejects interrupted downloads and never reports them as completed',async()=>{
 vi.stubGlobal('chrome',{downloads:{download:async()=>43,search:async()=>[{state:'interrupted'}]}})
 await expect(downloadSummaryPdf({name:'PO1HAGUE-Summary-WIPO123.pdf',bytes:new Uint8Array([37,80,68,70,45])})).rejects.toThrow(/中断/)
})

it('performs a final state check after a background-tab timer is delayed past its deadline',async()=>{
 vi.useFakeTimers();const search=vi.fn().mockResolvedValueOnce([{state:'in_progress'}]).mockResolvedValue([{state:'complete'}]);vi.stubGlobal('chrome',{downloads:{download:async()=>44,search}})
 const result=downloadSummaryPdf({name:'PO1HAGUE-Summary-WIPO123.pdf',bytes:new Uint8Array([37,80,68,70,45])})
 await vi.advanceTimersByTimeAsync(1);vi.setSystemTime(Date.now()+120000);await vi.advanceTimersByTimeAsync(250)
 await expect(result).resolves.toBe(44);vi.useRealTimers()
})

it('confirms completion from the Chrome event without waiting for a throttled page timer',async()=>{
 vi.useFakeTimers();let changed!:(delta:{id:number;state:{current:string}})=>void
 vi.stubGlobal('chrome',{downloads:{download:async()=>45,search:async()=>[{state:'in_progress'}],onChanged:{addListener:vi.fn((fn:(delta:{id:number;state:{current:string}})=>void)=>{changed=fn}),removeListener:vi.fn()}}})
 const job=downloadSummaryPdf({name:'PO1HAGUE-Summary-WIPO123.pdf',bytes:new Uint8Array([37,80,68,70,45])});await vi.advanceTimersByTimeAsync(0)
 expect(changed).toBeTypeOf('function');changed({id:45,state:{current:'complete'}})
 await expect(job).resolves.toBe(45);vi.useRealTimers()
})

it('reuses a durable completed download after reload and rejects a deleted file',async()=>{
 const name='PO1HAGUE-Summary-WIPO123.pdf',key=summaryDownloadKey(name,'case-abc'),search=vi.fn().mockResolvedValueOnce([{state:'complete',exists:true}]).mockResolvedValueOnce([{state:'complete',exists:false}])
 vi.stubGlobal('chrome',{storage:{local:{get:async()=>({[key]:{id:71}})}},downloads:{search}})
 expect(await findSummaryDownload(name,'case-abc')).toBe(71)
 expect(await findSummaryDownload(name,'case-abc')).toBeUndefined()
})
it('does not trust a malformed durable download identifier',async()=>{
 const name='PO1HAGUE-Summary-WIPO123.pdf',key=summaryDownloadKey(name,'case-abc'),search=vi.fn()
 vi.stubGlobal('chrome',{storage:{local:{get:async()=>({[key]:{id:'71'}})}},downloads:{search}})
 expect(await findSummaryDownload(name,'case-abc')).toBeUndefined();expect(search).not.toHaveBeenCalled()
})
