import { expect, it, vi } from 'vitest'
import { createHagueSessionHandler, probeHagueLogin } from '../../../src/background/hague-session'
import { HAGUE_SESSION_CHANNEL as channel } from '../../../src/hague/session-contract'

const sender = { id: 'test-extension', url: 'chrome-extension://test-extension/app.html' }
const tab = { id: 7, title: 'WIPO', url: 'https://hague.wipo.int/HagueEFilingWeb/protected/page/application.xhtml' }
const host = () => ({ extensionId: 'test-extension', queryTabs: vi.fn(async () => [tab, { id: 8, title: 'Other', url: 'https://hague.wipo.int.evil.test/' }]), getTab: vi.fn(async () => tab), getDocumentId: vi.fn(async () => 'doc-1'), createTab: vi.fn(async () => {}), executeScript: vi.fn(async () => [{ documentId: 'doc-1', result: { authenticated: true } }]) })
it('accepts only the extension workbench and the exact WIPO origin', async () => {
  const h = host(), handle = createHagueSessionHandler(h)
  expect(await handle({ channel, action: 'listTabs' }, sender)).toEqual({ ok: true, tabs: [{ id: 7, title: 'WIPO' }] })
  expect(await handle({ channel, action: 'verify', tabId: 7 }, { ...sender, url: 'https://hague.wipo.int/' })).toMatchObject({ ok: false })
  expect(h.executeScript).not.toHaveBeenCalled()
  h.getTab.mockResolvedValue({ ...tab, url: 'https://hague.wipo.int.evil.test/' })
  expect(await handle({ channel, action: 'verify', tabId: 7 }, sender)).toMatchObject({ ok: false })
  expect(h.executeScript).not.toHaveBeenCalled()
})
it('requires a positive server probe and the same document, not just an open WIPO tab', async () => {
  const h = host(), handle = createHagueSessionHandler(h)
  expect(await handle({ channel, action: 'verify', tabId: 7 }, sender)).toMatchObject({ ok: true, session: { tabId: 7, documentId: 'doc-1' } })
  h.getDocumentId.mockResolvedValue('doc-2')
  expect(await handle({ channel, action: 'verify', tabId: 7 }, sender)).toMatchObject({ ok: false })
})
it('reads the protected portfolio without treating a login page or bare viewstate as authenticated', async () => {
  vi.stubGlobal('location', { origin: 'https://hague.wipo.int' })
  const response = (html: string) => { const r = new Response(html); Object.defineProperty(r, 'url', { value: 'https://hague.wipo.int/HagueEFilingWeb/protected/portfolioManager.xhtml' }); return r }
  const fetcher = vi.fn(async () => response('<form id="portfolio"></form><form id="quickSearchPanel"></form><input name="javax.faces.ViewState" value="ignored">'))
  vi.stubGlobal('fetch', fetcher)
  try {
    expect(await probeHagueLogin()).toMatchObject({ authenticated: true })
    expect(fetcher.mock.calls).toHaveLength(1)
    fetcher.mockResolvedValue(response('<form><input type="password"><input name="javax.faces.ViewState"></form>'))
    expect(await probeHagueLogin()).toMatchObject({ authenticated: false })
  } finally { vi.unstubAllGlobals() }
})

it('distinguishes an unavailable login probe from a confirmed login redirect',async()=>{
 vi.stubGlobal('location',{origin:'https://hague.wipo.int'})
 const response=(status:number,url:string)=>{const r=new Response('',{status});Object.defineProperty(r,'url',{value:url});return r}
 const fetcher=vi.fn(()=>Promise.resolve(response(503,'https://hague.wipo.int/HagueEFilingWeb/protected/portfolioManager.xhtml')))
 vi.stubGlobal('fetch',fetcher)
 try{
  expect(await probeHagueLogin()).toMatchObject({authenticated:false,reason:'unavailable'})
  fetcher.mockResolvedValue(response(200,'https://hague.wipo.int/HagueEFilingWeb/login'))
  expect(await probeHagueLogin()).toMatchObject({authenticated:false,reason:'unauthenticated'})
 }finally{vi.unstubAllGlobals()}
})
it('recognizes a manual authentication redirect instead of hiding it behind a CORS network error',async()=>{
 vi.stubGlobal('location',{origin:'https://hague.wipo.int'})
 const response=new Response('');Object.defineProperty(response,'type',{value:'opaqueredirect'})
 const fetcher=vi.fn(async(_url:string,_init?:RequestInit)=>response);vi.stubGlobal('fetch',fetcher)
 try{expect(await probeHagueLogin()).toMatchObject({authenticated:false,reason:'unauthenticated'});expect(fetcher.mock.calls[0]?.[1]).toMatchObject({redirect:'manual'})}finally{vi.unstubAllGlobals()}
})
