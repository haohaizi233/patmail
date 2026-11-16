let active=0,lastFinished=Number.NEGATIVE_INFINITY,probe:Promise<unknown>|undefined
export const hagueBusinessActive=()=>active>0||Date.now()-lastFinished<60000
/** The first business request joins an already-dispatched probe. Subsequent
 * requests keep the independent JSF portfolio probe quiet until the batch rests. */
export async function withHagueBusinessActivity<T>(work:()=>Promise<T>):Promise<T>{
 active++
 try{await probe;return await work()}finally{active--;lastFinished=Date.now()}
}
export async function withIdleHagueProbe<T>(read:()=>Promise<T>):Promise<T|undefined>{
 if(hagueBusinessActive())return
 const current=read();probe=current
 try{return await current}finally{if(probe===current)probe=undefined}
}
