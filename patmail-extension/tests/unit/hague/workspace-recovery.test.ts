import { afterEach, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { Blob as NativeBlob, File as NativeFile } from 'node:buffer'
import { checkpointForBatch, restoreWorkspaceRows, saveWorkspaceMaterials,pruneWorkspaceMaterials, withHagueBatchLock, workspaceRows, type HagueWorkspace } from '../../../src/hague/workspace-recovery'
import type { HagueRow } from '../../../src/hague/workflow'

afterEach(()=>vi.unstubAllGlobals())
function setup(){vi.stubGlobal('indexedDB',new IDBFactory());vi.stubGlobal('Blob',NativeBlob);vi.stubGlobal('File',NativeFile)}
function material():HagueRow{
 const file=new File(['actual image bytes'],'1.1.jpg',{type:'image/jpeg',lastModified:123456})
 Object.defineProperty(file,'webkitRelativePath',{value:'cases/PO123HAGUE/FIGS/1.1.jpg'})
 return{folder:{path:'cases/PO123HAGUE',caseVolume:'PO123HAGUE',documents:[],images:[file],issues:[]},state:'review',error:'',confirmed:true}
}
function snapshot(row:HagueRow,id='generation'):HagueWorkspace{return{version:1,materialId:id,rows:workspaceRows([row],id),selected:0,concurrency:6,transport:'http',exportFormat:'pdf',current:null,batch:{cases:1,settled:0,succeeded:0,failed:0,skipped:0,active:0,done:0,total:20,stopped:false}}}
it('round trips material bytes and identity used by the plan fingerprint',async()=>{
 setup();const row=material(),saved=snapshot(row)
 await saveWorkspaceMaterials([row],'generation')
 const [restored]=await restoreWorkspaceRows(saved),file=restored.folder.images[0]
 expect(await file.text()).toBe('actual image bytes')
 expect([file.name,file.type,file.lastModified,file.webkitRelativePath]).toEqual(['1.1.jpg','image/jpeg',123456,'cases/PO123HAGUE/FIGS/1.1.jpg'])
 expect(restored.confirmed).toBe(true)
})
it('fails closed when material bytes are missing or the manifest belongs to another generation',async()=>{
 setup();const row=material(),saved=snapshot(row)
 await expect(restoreWorkspaceRows(saved)).rejects.toThrow('恢复材料缺失')
 await saveWorkspaceMaterials([row],'generation')
 saved.materialId='other'
 await expect(restoreWorkspaceRows(saved)).rejects.toThrow('材料清单不匹配')
})
it('never reuses a historical checkpoint for a newly staged job',()=>{
 const checkpoint={tabId:9,next:12,total:12,status:'saved' as const,stage:'saved',caseRunId:'old'}
 expect(checkpointForBatch(checkpoint,'new')).toBeUndefined()
 expect(checkpointForBatch(checkpoint,'old')).toBe(checkpoint)
})
it('reclaims old import generations only after replacement files have been committed',async()=>{
 setup();const row=material()
 await saveWorkspaceMaterials([row],'old');await saveWorkspaceMaterials([row],'new')
 await pruneWorkspaceMaterials('new')
 await expect(restoreWorkspaceRows(snapshot(row,'old'))).rejects.toThrow('恢复材料缺失')
 expect((await restoreWorkspaceRows(snapshot(row,'new')))[0].folder.images[0].size).toBe(row.folder.images[0].size)
})
it('does not execute a second page when the browser-wide batch lock is occupied',async()=>{
 const work=vi.fn(async()=>{}),unavailable=vi.fn()
 vi.stubGlobal('navigator',{locks:{request:vi.fn(async(_name:unknown,_options:unknown,callback:(lock:null)=>Promise<void>)=>callback(null))}})
 await withHagueBatchLock(work,unavailable)
 expect(work).not.toHaveBeenCalled();expect(unavailable).toHaveBeenCalledOnce()
})
