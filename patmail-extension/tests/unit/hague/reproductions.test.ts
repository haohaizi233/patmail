import {exportPageReproductions} from '../../../src/hague/http-client'
import {snapshotReproductionForm} from '../../../src/background/hague-http'
import {it,expect,vi} from 'vitest'
import {readReproductionsPdf,beforeSummaryExport} from '../../../src/hague/reproductions'
import {hagueActionState} from '../../../src/hague/action-state'
const url='https://hague.wipo.int/HagueEFilingWeb/protected/page/application.xhtml?appNo=123'
function doc(){return new DOMParser().parseFromString(`<title>WIPO reference 123</title><form id="designForm" method="post" action="application.xhtml"><input name="designForm" value="designForm"><input name="javax.faces.ViewState" value="fresh"><button name="designForm:preview" type="submit">Preview reproductions</button></form>`,'text/html')}
it('submits the official preview form and preserves its PDF under a distinct case filename',async()=>{
 const fetcher=vi.fn(async()=>new Response('%PDF-1.4 data',{headers:{'content-type':'application/pdf'}}))
 const pdf=await readReproductionsPdf(doc(),url,'123','PO1HAGUE',fetcher)
 expect(pdf.name).toBe('PO1HAGUE-Reproductions-WIPO123.pdf');expect(new TextDecoder().decode(pdf.bytes)).toBe('%PDF-1.4 data')
 const [target,init]=fetcher.mock.calls[0] as unknown as [string,RequestInit]
 expect(target).toBe(url.split('?')[0]);expect(init.method).toBe('POST');expect(init.credentials).toBe('include')
 const form=init.body instanceof URLSearchParams?init.body:new URLSearchParams()
 expect(form.get('designForm:preview')).toBe('');expect(form.get('javax.faces.ViewState')).toBe('fresh')
})
it('rejects HTML permission pages even with HTTP 200 and rejects a false PDF MIME',async()=>{
 for(const [body,mime]of [['<html>Login</html>','text/html'],['error','application/pdf']])await expect(readReproductionsPdf(doc(),url,'123','PO1HAGUE',async()=>new Response(body,{headers:{'content-type':mime}}))).rejects.toThrow()
})
it('rejects another case, external form action and missing ViewState before sending',async()=>{
 const f=vi.fn();await expect(readReproductionsPdf(doc(),url,'124','PO1HAGUE',f)).rejects.toThrow()
 const d=doc();d.querySelector('form')!.action='https://evil.test/';await expect(readReproductionsPdf(d,url,'123','PO1HAGUE',f)).rejects.toThrow()
 const missing=doc();missing.querySelector('input[name="javax.faces.ViewState"]')!.remove();await expect(readReproductionsPdf(missing,url,'123','PO1HAGUE',f)).rejects.toThrow();expect(f).not.toHaveBeenCalled()
})
const idle={busy:false,checking:false,listing:false,stopping:false,verified:true,workspaceReady:true,materialsDurable:true,pending:1,drafts:1,saved:1}
it('enables only meaningful actions and keeps stop available while busy',()=>{
 expect(hagueActionState(idle)).toMatchObject({configure:true,process:true,draft:true,exportSaved:true,stop:false})
 expect(hagueActionState({...idle,busy:true})).toMatchObject({configure:false,process:false,draft:false,exportSaved:false,stop:true})
 expect(hagueActionState({...idle,busy:true,stopping:true}).stop).toBe(false)
 for(const state of [{checking:true},{listing:true},{verified:false},{workspaceReady:false},{materialsDurable:false}])expect(hagueActionState({...idle,...state}).draft).toBe(false)
 expect(hagueActionState({...idle,pending:0,drafts:0,saved:0})).toMatchObject({process:false,draft:false,exportSaved:false})
})

it('waits for confirmed export and stops before Summary when export fails or stop is requested',async()=>{
 const order:string[]=[];await beforeSummaryExport(async()=>{await Promise.resolve();order.push('download-complete')});order.push('summary');expect(order).toEqual(['download-complete','summary'])
 await expect(beforeSummaryExport(async()=>{throw new Error('download interrupted')})).rejects.toMatchObject({diagnostic:{transportStatus:'not_dispatched',sideEffectMayHaveOccurred:false}})
 const abort=new AbortController();await expect(beforeSummaryExport(async()=>{abort.abort()},abort.signal)).rejects.toMatchObject({diagnostic:{sideEffectMayHaveOccurred:false}})
})

it('captures current JSF properties rather than stale serialized attributes in page transport',()=>{
 const old=document.title;document.title='WIPO reference 123'
 const form=document.createElement('form');form.id='designForm';form.innerHTML='<input name="javax.faces.ViewState" value="old"><input name="flag" type="checkbox"><select name="choice"><option value="a">A</option><option value="b">B</option></select>'
 document.body.append(form)
 try{(form.elements.namedItem('javax.faces.ViewState') as HTMLInputElement).value='current';(form.elements.namedItem('flag') as HTMLInputElement).checked=true;(form.elements.namedItem('choice') as HTMLSelectElement).value='b'
 const result=snapshotReproductionForm('123');const controls=new URLSearchParams(result.params);expect(controls.get('javax.faces.ViewState')).toBe('current');expect(controls.get('flag')).toBe('on');expect(controls.get('choice')).toBe('b');expect(result.form).toContain('value="old"')
 }finally{form.remove();document.title=old}
})

it('honors stop while waiting for a page form RPC that has not returned',async()=>{
 vi.stubGlobal('chrome',{runtime:{sendMessage:vi.fn(()=>new Promise(()=>{}))}})
 try{const controller=new AbortController();const pending=exportPageReproductions(7,'123','PO1HAGUE',undefined,undefined,controller.signal);controller.abort()
 expect(await Promise.race([pending.catch(e=>(e as Error).name),new Promise(resolve=>setTimeout(()=>resolve('still waiting'),40))])).toBe('AbortError')
 }finally{vi.unstubAllGlobals()}
})
