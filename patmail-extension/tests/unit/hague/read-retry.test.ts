import {afterEach,expect,it,vi} from 'vitest'
import {withNetworkReadRetry} from '../../../src/hague/read-retry'
import {HagueDiagnosticError} from '../../../src/hague/diagnostics/errors'
afterEach(()=>vi.useRealTimers())
it('waits through a transient outage and retries only the supplied read',async()=>{
 vi.useFakeTimers();let calls=0
 const work=withNetworkReadRetry(async()=>{if(++calls<4)throw new HagueDiagnosticError({errorCode:'NETWORK_FAILED',errorStage:'transport'});return'canonical receipt'})
 await vi.runAllTimersAsync();expect(await work).toBe('canonical receipt');expect(calls).toBe(4)
})
it.each(['PROTOCOL_UNSUPPORTED','NETWORK_ABORTED','BUSINESS_UNCONFIRMED'])('does not retry %s',async errorCode=>{
 const read=vi.fn(async()=>{throw new HagueDiagnosticError({errorCode,errorStage:'transport'})})
 await expect(withNetworkReadRetry(read)).rejects.toMatchObject({diagnostic:{errorCode}});expect(read).toHaveBeenCalledOnce()
})
it('allows a bounded read-only recheck while SSO is refreshing',async()=>{
 vi.useFakeTimers();let reads=0
 const work=withNetworkReadRetry(async()=>{if(++reads===1)throw new HagueDiagnosticError({errorCode:'AUTH_REDIRECT',errorStage:'http'});return'authenticated canonical read'})
 await vi.runAllTimersAsync();expect(await work).toBe('authenticated canonical read');expect(reads).toBe(2)
})
it('cancels a pending backoff immediately and does not dispatch another read',async()=>{
 vi.useFakeTimers();const controller=new AbortController(),read=vi.fn(async()=>{throw new HagueDiagnosticError({errorCode:'NETWORK_FAILED',errorStage:'transport'})})
 const work=withNetworkReadRetry(read,controller.signal);const assertion=expect(work).rejects.toMatchObject({name:'AbortError'})
 await vi.advanceTimersByTimeAsync(1);controller.abort();await assertion;expect(read).toHaveBeenCalledOnce()
})
it.each(['NETWORK_TIMEOUT','AUTH_REDIRECT'])('bounds repeated read failures (%s)',async errorCode=>{
 vi.useFakeTimers();const read=vi.fn(async()=>{throw new HagueDiagnosticError({errorCode,errorStage:'transport'})})
 const assertion=expect(withNetworkReadRetry(read)).rejects.toMatchObject({diagnostic:{errorCode}})
 await vi.runAllTimersAsync();await assertion;expect(read).toHaveBeenCalledTimes(6)
})
