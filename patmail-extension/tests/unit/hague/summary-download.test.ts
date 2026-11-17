import {it,expect,vi,afterEach} from 'vitest'
import {downloadSummaryPdf,findSummaryDownload,summaryDownloadKey} from '../../../src/hague/summary-download'
const name='PO1HAGUE-Summary-WIPO123.pdf',pdf={name,bytes:new Uint8Array([37,80,68,70,45])}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks()})
function setup(search=vi.fn(async()=>[{state:'complete',filename:name,exists:true}]),id=42){
 let created:((item:{id:number;url:string})=>void)|undefined,changed:((delta:{id:number;state:{current:string}})=>void)|undefined
 const removeCreated=vi.fn(),removeChanged=vi.fn(),revoke=vi.fn(),download=vi.fn()
 vi.stubGlobal('URL',{createObjectURL:vi.fn(()=>'blob:summary-test'),revokeObjectURL:revoke})
 vi.stubGlobal('chrome',{downloads:{download,search,onCreated:{addListener:vi.fn((fn:(item:{id:number;url:string})=>void)=>{created=fn}),removeListener:removeCreated},onChanged:{addListener:vi.fn((fn:(delta:{id:number;state:{current:string}})=>void)=>{changed=fn}),removeListener:removeChanged}}})
 const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){expect(this.download).toBe(name);created?.({id:999,url:'blob:other-case'});created?.({id,url:this.href})})
 return{search,download,click,revoke,removeCreated,removeChanged,changed:(state:string)=>changed?.({id,state:{current:state}})}
}
it('names the native Blob download and correlates its Chrome record without a page service-worker controller',async()=>{
 const h=setup();expect(await downloadSummaryPdf(pdf)).toBe(42)
 expect(h.click).toHaveBeenCalledOnce();expect(h.download).not.toHaveBeenCalled();expect(h.search).toHaveBeenCalledWith({id:42})
 expect(h.revoke).toHaveBeenCalledWith('blob:summary-test');expect(h.removeCreated).toHaveBeenCalledOnce()
})
it('rejects interrupted downloads and never reports them as completed',async()=>{
 const h=setup(vi.fn(async()=>[{state:'interrupted',filename:name,exists:false}]))
 await expect(downloadSummaryPdf(pdf)).rejects.toThrow(/中断/);expect(h.revoke).toHaveBeenCalledOnce()
})
it('rejects a completed download whose filename was replaced',async()=>{
 setup(vi.fn(async()=>[{state:'complete',filename:'下载.pdf',exists:true}]))
 await expect(downloadSummaryPdf(pdf)).rejects.toThrow(/文件名/)
})
it('performs a final state check after background timers are delayed past the deadline',async()=>{
 vi.useFakeTimers();setup(vi.fn().mockResolvedValueOnce([{state:'in_progress'}]).mockResolvedValue([{state:'complete',filename:name}]))
 const job=downloadSummaryPdf(pdf);await vi.advanceTimersByTimeAsync(1);vi.setSystemTime(Date.now()+120000);await vi.advanceTimersByTimeAsync(250)
 expect(await job).toBe(42)
})
it('uses the Chrome completion event without waiting for a throttled polling timer',async()=>{
 vi.useFakeTimers();const h=setup(vi.fn().mockResolvedValueOnce([{state:'in_progress'}]).mockResolvedValue([{state:'complete',filename:name}]))
 const job=downloadSummaryPdf(pdf);await vi.advanceTimersByTimeAsync(0);h.changed('complete');expect(await job).toBe(42)
})
it('bounds a blocked native download and removes its temporary resources',async()=>{
 vi.useFakeTimers();const h=setup();h.click.mockImplementation(()=>{})
 const assertion=expect(downloadSummaryPdf(pdf)).rejects.toThrow(/下载记录/);await vi.runAllTimersAsync();await assertion;expect(h.revoke).toHaveBeenCalledOnce()
})
it('reuses a durable completed download only when its name and existence still match',async()=>{
 const search=vi.fn().mockResolvedValueOnce([{state:'complete',exists:true,filename:name}]).mockResolvedValueOnce([{state:'complete',exists:false,filename:name}]).mockResolvedValueOnce([{state:'complete',exists:true,filename:'下载.pdf'}])
 vi.stubGlobal('chrome',{storage:{local:{get:async()=>({[summaryDownloadKey(name,'case-abc')]:{id:71}})}},downloads:{search}})
 expect(await findSummaryDownload(name,'case-abc')).toBe(71);expect(await findSummaryDownload(name,'case-abc')).toBeUndefined();expect(await findSummaryDownload(name,'case-abc')).toBeUndefined()
})
it('does not trust a malformed durable identifier',async()=>{
 const search=vi.fn();vi.stubGlobal('chrome',{storage:{local:{get:async()=>({[summaryDownloadKey(name,'case-abc')]:{id:'71'}})}},downloads:{search}})
 expect(await findSummaryDownload(name,'case-abc')).toBeUndefined();expect(search).not.toHaveBeenCalled()
})

it('downloads the official reproduction PDF with a filename distinct from Summary',async()=>{
 const drawName='PO1HAGUE-Reproductions-WIPO123.pdf';const h=setup(vi.fn(async()=>[{state:'complete',filename:drawName,exists:true}]))
 h.click.mockRestore()
 vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){expect(this.download).toBe(drawName);const created=(chrome.downloads.onCreated.addListener as unknown as {mock:{calls:Array<[(item:unknown)=>void]>}}).mock.calls.at(-1)![0];created({id:42,url:this.href})})
 expect(await downloadSummaryPdf({...pdf,name:drawName})).toBe(42)
})
