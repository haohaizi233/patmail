import { expect,it,vi } from 'vitest'
import { createHagueKeepalive,probeHagueLogin } from '../../../src/background/hague-session'
const tab={id:7,url:'https://hague.wipo.int/HagueEFilingWeb/protected/page/application.xhtml'}
it('polls one protected WIPO tab once per minute, without navigation or writes',async()=>{
 let now=0
 const h={queryTabs:vi.fn(()=>Promise.resolve([{id:1,url:'https://hague.wipo.int.evil.test/'},{id:2,url:'https://hague.wipo.int/HagueEFilingWeb/common/sessionTimedOut.xhtml'},tab,{...tab,id:8}])),executeScript:vi.fn(()=>Promise.resolve([{result:{authenticated:true}}]))}
 const poll=createHagueKeepalive(h,()=>now)
 await poll();await poll()
 expect(h.executeScript).toHaveBeenCalledTimes(1)
 expect(h.executeScript).toHaveBeenCalledWith({target:{tabId:7,frameIds:[0]},world:'ISOLATED',func:probeHagueLogin})
 now=60000;await poll();expect(h.executeScript).toHaveBeenCalledTimes(2)
})
it('does not overlap pending probes and tolerates login/network failures',async()=>{
 let resolve!:(value:never[])=>void,now=0
 const h={queryTabs:()=>Promise.resolve([tab]),executeScript:vi.fn(()=>new Promise<never[]>(r=>{resolve=r}))}
 const poll=createHagueKeepalive(h,()=>now)
 const first=poll();await Promise.resolve();now=60000;await poll()
 expect(h.executeScript).toHaveBeenCalledTimes(1)
 resolve([]);await first
 h.executeScript.mockRejectedValueOnce(new Error('closed'))
 now=120000;await expect(poll()).resolves.toBeUndefined()
})
it('does not open a site, inject into login pages or poll when no protected tab is open',async()=>{
 const h={queryTabs:()=>Promise.resolve([{id:7,url:'https://hague.wipo.int/HagueEFilingWeb/login'}]),executeScript:vi.fn()}
 await createHagueKeepalive(h)()
 expect(h.executeScript).not.toHaveBeenCalled()
})
