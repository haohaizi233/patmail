import {afterEach,expect,it,vi} from 'vitest'
import {createApp,nextTick} from 'vue'
import type {HagueRow} from '../../../src/hague/workflow'
import type {DraftCheckpoint} from '../../../src/hague/draft-contract'
import type {HagueWorkspace} from '../../../src/hague/workspace-recovery'
import HaguePage from '../../../src/app/pages/HaguePage.vue'
type Runner=typeof import('../../../src/hague/draft-runner').runDraftPlan
const mocks=vi.hoisted(()=>({get:vi.fn<()=>Promise<HagueWorkspace|null>>(),put:vi.fn<(slot:string,scope:string,payload:unknown)=>Promise<void>>(),restore:vi.fn(),run:vi.fn<Runner>(),verify:vi.fn(),http:vi.fn()}))
vi.mock('../../../src/recovery/client',()=>({createRecoveryClient:()=>({get:mocks.get,put:mocks.put})}))
vi.mock('../../../src/hague/workspace-recovery',async original=>({...await original<typeof import('../../../src/hague/workspace-recovery')>(),restoreWorkspaceRows:mocks.restore}))
vi.mock('../../../src/hague/draft-runner',async original=>({...await original<typeof import('../../../src/hague/draft-runner')>(),runDraftPlan:mocks.run}))
vi.mock('../../../src/hague/http-client',()=>({createHttpChain:mocks.http,httpRestoreCommands:()=>[],renderSavedSummary:vi.fn(),runHagueSessionRead:async(read:()=>Promise<unknown>)=>read()}))
vi.mock('../../../src/hague/session',()=>({hagueSessionClient:{listTabs:async()=>[{id:9,title:'WIPO'}],verify:mocks.verify,open:vi.fn()}}))
vi.mock('../../../src/app/services/full-page-bridge',()=>({createFullPageBridge:()=>({request:vi.fn()})}))
vi.mock('../../../src/hague/draft-completion',()=>({showDraftCompletion:vi.fn(),draftReviewNotes:()=>[]}))
vi.mock('../../../src/app/components/HagueDiagnostics.vue',()=>({default:{render:()=>null}}))
vi.mock('../../../src/shell/components/Bunny.vue',()=>({default:{render:()=>null}}))
vi.mock('../../../src/shell/components/PageHead.vue',()=>({default:{render:()=>null}}))
function row(n:number):HagueRow{return{folder:{caseVolume:`PO${n}HAGUE`,path:`case${n}`,documents:[],images:[new File(['x'],'1.1.jpg',{type:'image/jpeg'})],issues:[]},filing:{locarno:'28',products:[['1','1','Bottle','03']],description:'',views:[{number:'1.1',code:'1',label:'Perspective'}],issues:[]},decision:{applicant:{name:'Example',address:'Street',city:'Shenzhen',region:'Guangdong',postalCode:'518000',country:'CN'},creators:[{givenName:'A',familyName:'B',address:{name:'Example',address:'Street',city:'Shenzhen',region:'Guangdong',postalCode:'518000',country:'CN'}}],parties:['EM'],publicationMonths:6,priorities:[],warnings:[],evidence:[]},state:'review',error:'',confirmed:true}}
let app:ReturnType<typeof createApp>|undefined
afterEach(()=>{app?.unmount();app=undefined;vi.unstubAllGlobals();vi.clearAllMocks()})
function setup(){
 const rows=[row(1),row(2)]
 const complete:DraftCheckpoint={tabId:9,next:15,total:15,stage:'saved',status:'saved',reference:'123',transport:'http',caseRunId:'batch-one'}
 const partial:DraftCheckpoint={...complete,next:5,status:'stopped',reference:'124',caseRunId:'batch-two'}
 mocks.get.mockResolvedValue({version:1,materialId:'files',rows:[],selected:1,concurrency:6,transport:'http',exportFormat:'pdf',batch:{cases:2,settled:1,succeeded:1,failed:0,skipped:0,active:1,done:20,total:30,stopped:false},current:partial,approvedTab:9,activeBatch:{parallel:true,jobs:[{path:'case1',caseRunId:'batch-one'},{path:'case2',caseRunId:'batch-two'}]}})
 mocks.restore.mockResolvedValue(rows);mocks.put.mockResolvedValue(undefined)
 mocks.verify.mockResolvedValue({tabId:9,title:'WIPO',documentId:'fresh',verifiedAt:Date.now(),expiresAt:Date.now()+300000})
 mocks.http.mockReturnValue({call:vi.fn(),recover:vi.fn()})
 mocks.run.mockImplementation(async(_plan,tab,host,_signal,checkpoint)=>{const result={...checkpoint,tabId:tab,next:15,total:15,status:'saved' as const,stage:'saved'};await host.save(result);return result})
 vi.stubGlobal('URL',class extends URL{static createObjectURL(){return'blob:test'}static revokeObjectURL(){}})
 vi.stubGlobal('navigator',{locks:{request:async(_name:unknown,_options:unknown,callback:(lock:object)=>Promise<void>)=>callback({})}})
 const send=vi.fn(async()=>({ok:true}))
 vi.stubGlobal('chrome',{runtime:{sendMessage:send},storage:{local:{get:async(key:string)=>({[key]:key.endsWith('PO1HAGUE')?complete:partial}),set:vi.fn(async()=>{})}}})
 return{rows,send,partial}
}
function mount(){const root=document.createElement('div');app=createApp(HaguePage,{embedded:true});app.directive('hint',{});app.mount(root);return root}
it('automatically resumes only the unfinished same-generation job after quiet and fresh verification',async()=>{
 const {send,partial}=setup();let release!:(value:{ok:boolean})=>void
 send.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve}))
 const root=mount()
 await vi.waitFor(()=>expect(send).toHaveBeenCalledWith(expect.objectContaining({action:'waitIdle'})))
 expect(mocks.verify).not.toHaveBeenCalled();expect(mocks.run).not.toHaveBeenCalled()
 release({ok:true})
 await vi.waitFor(()=>expect(root.textContent).toContain('成功 2，异常 0，跳过 0'))
 expect(mocks.verify).toHaveBeenCalledWith(9);expect(mocks.run).toHaveBeenCalledOnce()
 expect(mocks.run.mock.calls[0][4]).toMatchObject(partial)
 expect(mocks.run.mock.calls[0][2].caseRunId).toBe('batch-two')
 expect(mocks.put.mock.calls.at(-1)?.[2]).not.toHaveProperty('activeBatch')
})
it('does not write when restored material bytes cannot be recovered',async()=>{
 setup();mocks.restore.mockRejectedValueOnce(new Error('恢复材料缺失'))
 const root=mount();await vi.waitFor(()=>expect(root.textContent).toContain('恢复材料缺失'))
 // Read-only automatic login detection is independent of material recovery.
 expect(mocks.run).not.toHaveBeenCalled()
})
it('reactively displays canonical checkpoints newer than the workspace snapshot without an active batch',async()=>{
 setup();const snapshot=await mocks.get();mocks.get.mockResolvedValue({...snapshot!,activeBatch:undefined})
 const root=mount()
 await vi.waitFor(()=>expect(root.textContent).toContain('本机记录曾保存 1 件'))
 expect(root.textContent).toContain('已恢复 2 件材料及工作台')
 expect(mocks.verify).not.toHaveBeenCalled();expect(mocks.run).not.toHaveBeenCalled()
})
it('leaves the batch untouched when another extension page owns the run lock',async()=>{
 const {send}=setup()
 vi.stubGlobal('navigator',{locks:{request:async(_name:unknown,_options:unknown,callback:(lock:null)=>Promise<void>)=>callback(null)}})
 const root=mount();await nextTick()
 await vi.waitFor(()=>expect(root.textContent).toContain('另一工作台正在执行海牙批次'))
 expect(send).not.toHaveBeenCalled();expect(mocks.verify).not.toHaveBeenCalled();expect(mocks.run).not.toHaveBeenCalled()
})
