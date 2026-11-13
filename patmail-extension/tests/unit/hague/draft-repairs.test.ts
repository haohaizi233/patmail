import { expect,it } from 'vitest'
import { repairRepeatedDesignNumbers,restoreApprovedDesignNumbers,withDraftCorrections } from '../../../src/hague/draft-repairs'
import type { DraftCheckpoint } from '../../../src/hague/draft-contract'
import type { Filing } from '../../../src/hague/materials'
import { draftReviewNotes } from '../../../src/hague/draft-completion'
import type { HagueRow } from '../../../src/hague/workflow'
const filing=():Filing=>({locarno:'13',products:[['1','1','Charger','02'],['1','2','Charger','02']],description:'',views:[{number:'1.1',code:'1',label:'Perspective'},{number:'2.1',code:'1',label:'Perspective'},{number:'2.2',code:'2',label:'Front'}],issues:[]})
const images=['1.1','2.1','2.2'].map(n=>new File(['x'],n+'.jpg'))
it('repairs repeated original numbers only when ordered groups, products and counts agree',()=>{
 const f=filing(),fixed=repairRepeatedDesignNumbers(f,images)
 expect(fixed?.products.map(p=>p[0])).toEqual(['1','2'])
 expect(f.products.map(p=>p[0])).toEqual(['1','1'])
 expect(fixed?.draftCorrections?.join()).toContain('经用户确认')
})
it('retains correction disclosure before arbitration and after a replacement decision',()=>{
 const row={folder:{caseVolume:'PO1HAGUE'},filing:repairRepeatedDesignNumbers(filing(),images)} as HagueRow
 expect(draftReviewNotes(row).join()).toContain('修正为 1–2')
 row.decision={warnings:[]} as unknown as HagueRow['decision']
 expect(draftReviewNotes(row).join()).toContain('修正为 1–2')
 row.decision={warnings:['新的仲裁结果']} as unknown as HagueRow['decision']
 expect(draftReviewNotes(row).join()).toContain('修正为 1–2')
})
it('persists correction disclosures into checkpoints without losing existing warnings',()=>{
 const f=repairRepeatedDesignNumbers(filing(),images)!
 const saved=withDraftCorrections({warnings:['待审核']} as DraftCheckpoint,f)
 expect(saved.warnings?.join()).toContain('修正为 1–2')
 expect(saved.warnings).toContain('待审核')
 expect(withDraftCorrections(saved,f).warnings).toHaveLength(2)
})
it('refuses ambiguous products or mismatched view/image counts',()=>{
 const f=filing();f.products[1][2]='Different'
 expect(repairRepeatedDesignNumbers(f,images)).toBeNull()
 expect(repairRepeatedDesignNumbers(filing(),images.slice(1))).toBeNull()
 const missing=filing();missing.views.pop()
 expect(repairRepeatedDesignNumbers(missing,images)).toBeNull()
})

it('restores only an exact prior approved correction on reimport',()=>{
 const raw=filing(),approved=repairRepeatedDesignNumbers(raw,images)!
 const checkpoint=withDraftCorrections({status:'saved'} as DraftCheckpoint,approved)
 expect(restoreApprovedDesignNumbers(raw,images,checkpoint).products.map(p=>p[0])).toEqual(['1','2'])
 expect(restoreApprovedDesignNumbers(raw,images,{...checkpoint,designNumberCorrection:undefined,warnings:['待核对设计编号']})).toBe(raw)
 expect(restoreApprovedDesignNumbers(raw,images.slice(1),checkpoint)).toBe(raw)
 const changed=filing();changed.products[1][2]='Different'
 expect(restoreApprovedDesignNumbers(changed,images,checkpoint)).toBe(changed)
})
it('requires an input fingerprint for a legacy approval record',()=>{
 const raw=filing();raw.products=Array.from({length:6},()=>['1','1','Charger','02']);raw.views=Array.from({length:6},(_,i)=>({number:`${i+1}.1`,code:'1',label:'Perspective'}))
 const files=raw.views.map(v=>new File(['x'],v.number+'.jpg'))
 const checkpoint={status:'saved',warnings:['原Word六行设计编号均为1；经用户确认，草稿按产品表行顺序及图纸分组修正为1–6，请核对。']} as DraftCheckpoint
 expect(restoreApprovedDesignNumbers(raw,files,checkpoint)).toBe(raw)
})

it('does not apply a prior approval when all products or subclasses change together',()=>{
 const original=filing(),repaired=repairRepeatedDesignNumbers(original,images)!
 const checkpoint=withDraftCorrections({status:'saved'} as DraftCheckpoint,repaired)
 const renamed=filing();renamed.products.forEach(p=>{p[2]='New product'})
 const subclass=filing();subclass.products.forEach(p=>{p[3]='03'})
 expect(restoreApprovedDesignNumbers(renamed,images,checkpoint)).toBe(renamed)
 expect(restoreApprovedDesignNumbers(subclass,images,checkpoint)).toBe(subclass)
})

it.each(['uncertain','stopped','running','failed'] as const)('restores a fingerprint-bound approval with a %s checkpoint without resetting it',status=>{
 const raw=filing(),repaired=repairRepeatedDesignNumbers(raw,images)!
 const checkpoint=withDraftCorrections({status,next:1,total:20,tabId:7} as DraftCheckpoint,repaired)
 expect(restoreApprovedDesignNumbers(raw,images,checkpoint).products.map(p=>p[0])).toEqual(['1','2'])
 expect(checkpoint.status).toBe(status);expect(checkpoint.next).toBe(1)
})
