import type {DraftCommand} from './draft-contract'
import {sha256Hex,sha256Bytes} from '../automation/sha256'
export interface PlanIdentity {version:1;steps:string[]}
interface Step {command:DraftCommand;file?:File}
const fileHashes=new WeakMap<Blob,Promise<string>>()
function stable(value:unknown):unknown{
 if(Array.isArray(value))return value.map(stable)
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,v])=>[k,stable(v)]))
 return value
}
async function bytes(file:Blob):Promise<ArrayBuffer>{
 if(typeof file.arrayBuffer==='function')return file.arrayBuffer()
 return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result as ArrayBuffer);reader.onerror=()=>reject(reader.error??new Error('无法读取图纸内容，未开始恢复。'));reader.readAsArrayBuffer(file)})
}
async function contentHash(file:File):Promise<string>{
 let pending=fileHashes.get(file)
 if(!pending){pending=(async()=>{const buffer=await bytes(file);if(crypto.subtle){const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',buffer));return [...digest].map(b=>b.toString(16).padStart(2,'0')).join('')}return sha256Bytes(new Uint8Array(buffer))})();fileHashes.set(file,pending)}
 return pending
}
/** Business values and immutable file bytes; timestamps and presentation are not writes. */
export async function createPlanIdentity(steps:readonly Step[]):Promise<PlanIdentity>{
 const hashes:string[]=[]
 for(const step of steps){
  const command=step.command.op==='upload'&&step.file?{...step.command,base64:undefined}:step.command
  const file=step.file?{name:step.file.name,size:step.file.size,sha256:await contentHash(step.file)}:undefined
  hashes.push(sha256Hex(JSON.stringify(stable({command,file}))))
 }
 return{version:1,steps:hashes}
}
export function comparePlanIdentity(previous:PlanIdentity,current:PlanIdentity,next:number):{outcome:'same'|'future-changed'|'changed';changed:number[]}{
 if(previous.version!==1||current.version!==1||!Number.isSafeInteger(next)||next<0||next>previous.steps.length)return{outcome:'changed',changed:[0]}
 const changed=Array.from({length:Math.max(previous.steps.length,current.steps.length)},(_,i)=>i).filter(i=>previous.steps[i]!==current.steps[i])
 return{outcome:changed.length===0?'same':changed.some(i=>i<=next)?'changed':'future-changed',changed}
}
