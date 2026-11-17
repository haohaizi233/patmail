let active=0,lastFinished=Number.NEGATIVE_INFINITY,probe:Promise<unknown>|undefined
const idleListeners=new Set<()=>void>()
export const hagueBusinessActive=()=>active>0||Date.now()-lastFinished<60000
/** The first business request joins an already-dispatched probe. Subsequent
 * requests keep the independent JSF portfolio probe quiet until the batch rests. */
export async function withHagueBusinessActivity<T>(work:()=>Promise<T>):Promise<T>{
 active++
 try{await probe;return await work()}finally{active--;lastFinished=Date.now();for(const notify of idleListeners)notify()}
}
/** Reloaded UIs wait for their predecessor's requests before reading/retrying. */
export async function waitForHagueIdle(timeout=120000,quiet=500):Promise<void>{
 await new Promise<void>((resolve,reject)=>{
  let settle:ReturnType<typeof setTimeout>|undefined
  const cleanup=()=>{clearTimeout(deadline);if(settle!==undefined)clearTimeout(settle);idleListeners.delete(check)}
  const check=()=>{if(settle!==undefined)clearTimeout(settle);if(active===0)settle=setTimeout(()=>{if(active===0){cleanup();resolve()}else check()},quiet)}
  const deadline=setTimeout(()=>{cleanup();reject(new Error('旧海牙请求尚未结束，已保留检查点，未重复写入。'))},timeout)
  idleListeners.add(check);check()
 })
}
export async function withIdleHagueProbe<T>(read:()=>Promise<T>):Promise<T|undefined>{
 if(hagueBusinessActive()||probe)return
 const current=read();probe=current
 try{return await current}finally{if(probe===current)probe=undefined;for(const notify of idleListeners)notify()}
}
