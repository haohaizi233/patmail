import { expect, it, vi } from 'vitest'
import { openDraftTab } from '../../../src/hague/draft-tabs'
const verify=vi.hoisted(()=>vi.fn())
vi.mock('../../../src/hague/session',()=>({hagueSessionClient:{verify}}))

it('opens a background portfolio tab and validates that exact tab before use',async()=>{
 const create=vi.fn(async()=>({id:12})),get=vi.fn(async()=>({id:12,status:'complete',url:'https://hague.wipo.int/HagueEFilingWeb/protected/portfolioManager.xhtml'}))
 vi.stubGlobal('chrome',{tabs:{create,get}});verify.mockResolvedValue({})
 try{expect(await openDraftTab()).toBe(12);expect(create).toHaveBeenCalledWith({url:'https://hague.wipo.int/HagueEFilingWeb/protected/portfolioManager.xhtml',active:false});expect(verify).toHaveBeenCalledWith(12)}finally{vi.unstubAllGlobals();verify.mockReset()}
})

it('does not return a worker on a login redirect or failed server session probe',async()=>{
 const get=vi.fn(async()=>({status:'complete',url:'https://hague.wipo.int/HagueEFilingWeb/login'}))
 vi.stubGlobal('chrome',{tabs:{create:async()=>({id:13}),get}})
 try{
  await expect(openDraftTab()).rejects.toThrow(/登录/);expect(verify).not.toHaveBeenCalled()
  get.mockResolvedValue({status:'complete',url:'https://hague.wipo.int/HagueEFilingWeb/protected/portfolioManager.xhtml'});verify.mockRejectedValue(new Error('登录失效'))
  await expect(openDraftTab()).rejects.toThrow(/登录/)
 }finally{vi.unstubAllGlobals();verify.mockReset()}
})
