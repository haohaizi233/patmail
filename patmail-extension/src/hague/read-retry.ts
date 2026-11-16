import {HagueDiagnosticError} from './diagnostics/errors'

/** Only wrap reads or canonical receipt inspection, never an application write.
 * Network outages do not prove that an earlier POST was rejected. */
export async function withNetworkReadRetry<T>(read:()=>Promise<T>,signal?:AbortSignal):Promise<T>{
 const delays=[1000,4000,15000,45000,60000]
 for(let attempt=0;;attempt++){
  if(signal?.aborted)throw new DOMException('Read cancelled','AbortError')
  try{return await read()}catch(error){
   if(!(error instanceof HagueDiagnosticError)||!['NETWORK_FAILED','NETWORK_TIMEOUT','RPC_FAILED'].includes(error.diagnostic.errorCode)||attempt>=delays.length)throw error
   await new Promise<void>((resolve,reject)=>{
    const abort=()=>{clearTimeout(timer);reject(new DOMException('Read cancelled','AbortError'))}
    const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve()},delays[attempt])
    if(signal?.aborted){abort();return}
    signal?.addEventListener('abort',abort,{once:true})
   })
  }
 }
}
