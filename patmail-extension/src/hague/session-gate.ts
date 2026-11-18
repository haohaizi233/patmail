/** Independent case views share six slots. Portfolio navigation and recovery
 * take all slots, so no allocation can reset a view mid-command. FIFO ordering
 * prevents queued navigation from being starved by later field commands. */
export class HagueSessionGate {
 private free=6
 private queue:Array<{slots:number;enter:()=>void}>=[]
 private drain(){while(this.queue.length&&this.queue[0].slots<=this.free){const next=this.queue.shift()!;this.free-=next.slots;next.enter()}}
 private acquire(exclusive:boolean,signal?:AbortSignal):Promise<()=>void>{
  return new Promise((resolve,reject)=>{
   if(signal?.aborted){reject(new Error('已停止'));return}
   const slots=exclusive?6:1
   const abort=()=>{const index=this.queue.indexOf(entry);if(index>=0)this.queue.splice(index,1);signal?.removeEventListener('abort',abort);reject(new Error('已停止'));this.drain()}
   const entry={slots,enter:()=>{
    signal?.removeEventListener('abort',abort);let released=false
    resolve(()=>{if(released)return;released=true;this.free+=slots;this.drain()})
   }}
   this.queue.push(entry);signal?.addEventListener('abort',abort,{once:true});this.drain()
  })
 }
 async run<T>(work:()=>Promise<T>,exclusive=true,signal?:AbortSignal):Promise<T>{
  const release=await this.acquire(exclusive,signal)
  try{if(signal?.aborted)throw new Error('已停止');return await work()}finally{release()}
 }
}
