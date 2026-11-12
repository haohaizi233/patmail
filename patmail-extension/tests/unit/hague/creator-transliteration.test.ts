import { expect,it } from 'vitest'
import { applySourceFields } from '../../../src/hague/source'
import { parseDecision,formatHagueMaterial } from '../../../src/hague/arbitration'
const source=JSON.stringify({GetCaseInventor:[{TableRows:[{inventor_name_cn:'张三'},{inventor_name_cn:'陈丽偲',first_name_en:'Lisi',last_name_en:'CHEN'},{inventor_name_cn:'欧阳小明'}]}]})
const reply=(creators:unknown[])=>parseDecision(JSON.stringify({applicant:{name:'Example',address:'District',city:'Shenzhen',region:'Guangdong',postalCode:'518000',country:'CN'},creators,parties:['EM'],publicationMonths:6,warnings:[],evidence:['source']}))
it('accepts source-matched AI pinyin, normalizes its case and preserves existing source English names',()=>{
 const d=reply([{sourceName:'欧阳小明',givenName:'xiao ming',familyName:'ou yang'},{sourceName:'张三',givenName:'san',familyName:'zhang'},{sourceName:'陈丽偲',givenName:'Wrong',familyName:'GUESS'}])
 const result=applySourceFields(d,source)
 expect(result.creators.map(c=>[c.givenName,c.familyName])).toEqual([['San','ZHANG'],['Lisi','CHEN'],['Xiaoming','OUYANG']])
 expect(result.creators[0]).toMatchObject({sourceName:'张三',nameOrigin:'ai-transliterated'})
 expect(result.creators[1]).toMatchObject({nameOrigin:'source'})
 expect(result.warnings.join()).not.toContain('缺少可靠英文')
 expect(result.evidence.join()).toContain('AI 拼音转写')
})
it('does not borrow a translation from another name or accept non-Latin output',()=>{
 const result=applySourceFields(reply([{sourceName:'李四',givenName:'Si',familyName:'LI'},{sourceName:'张三',givenName:'三',familyName:'ZHANG'}]),source)
 expect(result.creators[0].givenName).toBe('')
 expect(result.creators[1].givenName).toBe('Lisi')
 expect(result.creators[2].givenName).toBe('')
})
it('asks the assistant to transliterate missing source names in the normal batch',()=>{
 const text=formatHagueMaterial('PO1HAGUE',{locarno:'28',products:[],description:'',views:[],issues:[]},source)
 expect(text).toContain('张三');expect(text).toContain('AI');expect(text).toContain('拼音')
 expect(text).not.toContain('需人工补充')
})
