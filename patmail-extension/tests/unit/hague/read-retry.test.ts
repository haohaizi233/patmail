import {afterEach,expect,it,vi} from 'vitest'
import {withNetworkReadRetry} from '../../../src/hague/read-retry'
import {HagueDiagnosticError} from '../../../src/hague/diagnostics/errors'
afterEach(()=>vi.useRealTimers())
it('waits through a transient outage and retries only the supplied read',async()=>{
 vi.useFakeTimers();let calls=0
 const work=withNetworkReadRetry(async()=>{if(++calls<4)throw new HagueDiagnosticError({errorCode:'NETWORK_FAILED',errorStage:'transport'});return'canonical receipt'})
 await vi.runAllTimersAsync();expect(await work).toBe('canonical receipt');expect(calls).toBe(4)
})
it.each(['AUTH_REDIRECT','PROTOCOL_UNSUPPORTED','NETWORK_ABORTED','BUSINESS_UNCONFIRMED'])('does not retry %s',async errorCode=>{
 const read=vi.fn(async()=>{throw new HagueDiagnosticError({errorCode,errorStage:'transport'})})
 await expect(withNetworkReadRetry(read)).rejects.toMatchObject({diagnostic:{errorCode}});expect(read).toHaveBeenCalledOnce()
})
it('cancels a pending backoff immediately and does not dispatch another read',async()=>{
 vi.useFakeTimers();const controller=new AbortController(),read=vi.fn(async()=>{throw new HagueDiagnosticError({errorCode:'NETWORK_FAILED',errorStage:'transport'})})
 const work=withNetworkReadRetry(read,controller.signal);const assertion=expect(work).rejects.toMatchObject({name:'AbortError'})
 await vi.advanceTimersByTimeAsync(1);controller.abort();await assertion;expect(read).toHaveBeenCalledOnce()
})
it('bounds repeated network failures',async()=>{
 vi.useFakeTimers();const read=vi.fn(async()=>{throw new HagueDiagnosticError({errorCode:'NETWORK_TIMEOUT',errorStage:'transport'})})
 const assertion=expect(withNetworkReadRetry(read)).rejects.toMatchObject({diagnostic:{errorCode:'NETWORK_TIMEOUT'}})
 await vi.runAllTimersAsync();await assertion;expect(read).toHaveBeenCalledTimes(6)
})
