import {expect,it,vi} from 'vitest'
import {hagueSessionClient} from '../../../src/hague/session'
it.each(['unavailable','unauthenticated'])('preserves the %s probe classification across RPC',async code=>{
 vi.stubGlobal('chrome',{runtime:{lastError:null,sendMessage:(_message:unknown,callback:(reply:unknown)=>void)=>callback({ok:false,error:'probe failed',code})}})
 try{
  const error=await hagueSessionClient.verify(7).catch((e:unknown)=>e)
  expect(hagueSessionClient.isTransientError(error)).toBe(code==='unavailable')
 }finally{vi.unstubAllGlobals()}
})
