import { expect, it } from 'vitest'
import { buildDraftPlan } from '../../../src/hague/draft-plan'
import type { HagueRow } from '../../../src/hague/workflow'

function row(): HagueRow {
  const applicant = { name: 'Example Ltd.', address: 'No. 1, Nanshan District', city: 'Shenzhen', region: 'Guangdong', postalCode: '518000', country: 'China' }
  return { folder: { path: 'PO1HAGUE', caseVolume: 'PO1HAGUE', documents: [], images: ['1.10', '1.2', '1.1'].map(n => new File(['jpg'], `${n}.jpg`, { type: 'image/jpeg' })), issues: [] }, filing: { locarno: '28', products: [['1','3','Oral waterjet','3']], description: 'Actual description', views: [{ number:'1.1', code:'1', label:'Perspective' },{ number:'1.2', code:'2', label:'Front' },{ number:'1.10', code:'11', label:'Enlarged' }], issues: [] }, decision: { applicant, creators: [{ givenName: 'Lisi', familyName: 'CHEN', address: applicant }], parties: ['JP', 'EM'], publicationMonths: 6, priorities: [], warnings: [], evidence: [] }, state: 'review', confirmed: false, error: '' }
}
it('makes a source-specific draft with numeric image order and semantic legends', () => {
  const plan = buildDraftPlan(row())
  expect(plan.designs[0].images.map(i=>i.number)).toEqual(['1.1','1.2','1.10'])
  expect(plan.designs[0].images[2].legend).toBe('Enlarged')
  expect(plan.parties).toEqual(['JP','EM'])
  expect(plan.creators[0].address).toEqual(plan.applicants[0])
  expect(plan.reference).toBe('PO1HAGUE')
})
it('retains the second applicant and resolves municipality address before any site write', () => {
  const r=row()
  r.source=JSON.stringify({GetCaseApplicant:[{TableRows:[{applicant_name_en:'Example Ltd.',contact_address_en:'No. 1, Nanshan District',city:'深圳市',province:'广东省',postcode:'518000',country_zh_cn:'中国'},{applicant_name_en:'Second Ltd.',contact_address_en:'No. 2, Xuhui District, Shanghai',city:'徐汇区',province:'上海市',postcode:'200233',country_zh_cn:'中国'}]}]})
  expect(buildDraftPlan(r).applicants).toHaveLength(2)
  expect(buildDraftPlan(r).applicants[1].city).toBe('Shanghai')
})
it('uses the subclass column rather than the adjacent total-reproduction column',()=>{
 const r=row();r.filing!.locarno='12';r.filing!.products[0]=['1','3','Bumper for vehicle','16']
 expect(buildDraftPlan(r).designs[0].subclass).toBe('16')
})
it('keeps 1.x and 2.x in independent designs with their own product and subclass',()=>{
 const r=row();r.filing!.products.push(['2','2','Second product','2'])
 r.folder.images.push(new File(['jpg'],'2.2.jpg'),new File(['jpg'],'2.1.jpg'))
 r.filing!.views.push({number:'2.1',code:'2',label:'Front'},{number:'2.2',code:'6',label:'Left'})
 const designs=buildDraftPlan(r).designs
 expect(designs.map(d=>({number:d.number,subclass:d.subclass,product:d.product,images:d.images.map(i=>i.number)}))).toEqual([{number:'1',subclass:'3',product:'Oral waterjet',images:['1.1','1.2','1.10']},{number:'2',subclass:'2',product:'Second product',images:['2.1','2.2']}])
})
it('blocks incomplete creators and view mismatches before a new draft can be created', () => {
  const r=row(); r.decision!.creators[0].givenName=''
  expect(()=>buildDraftPlan(r)).toThrow(/设计人/)
  r.decision!.creators[0].givenName='Lisi';r.filing!.views.pop()
  expect(()=>buildDraftPlan(r)).toThrow(/视图|图纸|图片/)
})
it('blocks a legacy slash postcode before any target-site write', () => {
  const r = row(); r.decision!.applicant.postalCode = '/'
  expect(() => buildDraftPlan(r)).toThrow(/邮编/)
})
