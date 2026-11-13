import { expect,it } from 'vitest'
import { repairRepeatedDesignNumbers,withDraftCorrections } from '../../../src/hague/draft-repairs'
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
