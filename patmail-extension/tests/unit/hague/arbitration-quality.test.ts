import { expect,it } from 'vitest'
import { applySourceFields,sourceRequirements,parsedHagueSource } from '../../../src/hague/source'
import { parseDecision, type Decision } from '../../../src/hague/arbitration'
const source=(remark:string,extra:Record<string,unknown>={})=>JSON.stringify({GetCaseInfo:[{CaseInfo:[{remark}]}],...extra})
const decision=():Decision=>({applicant:{name:'Example Ltd.',address:'District',city:'Shenzhen',region:'Guangdong',postalCode:'518000',country:'CN'},creators:[],parties:['EM'],publicationMonths:0,priorities:[],warnings:[],evidence:[]})
it('does not interpret application numbers or publication references as unknown countries',()=>{
 for(const remark of ['海牙指定欧盟、英国、日本、美国35/526,437；公开方式：立即公开，未在公开渠道出现过','海牙进入美国申请号35/523,328（公告号：US D1,123,008 S，公告日：2026-4-21）、日本申请号2024-503895证书号1798641、英国、欧盟、加拿大236374\n立即公开']){
  const r=sourceRequirements(source(remark));expect(r.unrecognized).toEqual([]);expect(r.publicationMonths).toBe(0)
 }
})
it('reads alternate country wording, Brazil and publication conflicts without making zero a default',()=>{
 expect(sourceRequirements(source('海牙进入欧盟、俄罗斯、巴西、英国；公开情况：12个月标准公开')).parties).toEqual(expect.arrayContaining(['EM','RU','BR','GB']))
 const r=sourceRequirements(source('海牙外观，申请国家为英国、欧盟、日本设计1申请号2024-503728证书号1799043\n正常公开（已申请提前公开）'))
 expect(r.parties).toEqual(expect.arrayContaining(['GB','EM','JP']));expect(r.unrecognized).toEqual([]);expect(r.publicationMonths).toBe(12)
 const applied=applySourceFields(decision(),source('申请国家为英国、欧盟、日本\n正常公开（已申请提前公开）'))
 expect(applied.publicationMonths).toBe(12);expect(applied.warnings.join()).not.toMatch(/公开.*(?:冲突|待人工确认)/)
 expect(parseDecision(JSON.stringify({...decision(),publicationMonths:null})).publicationMonths).toBeNull()
 expect(sourceRequirements(source('海牙进入欧盟；不立即公开，正常公开')).publicationMonths).toBe(12)
 expect(sourceRequirements(source('海牙进入欧盟；原要求正常公开，又要求立即公开')).publicationMonths).toBeNull()
})
it('uses an English source name stored in the CN field and treats Singapore province as optional',()=>{
 const input=source('海牙进入欧盟，英国，日本申请号2025-503936，加拿大246568。公开方式：立即公开，在某年展会展示过',{GetCaseApplicant:[{TableRows:[{applicant_name_cn:'EXAMPLE LIFE PTE. LTD.',applicant_name_en:'',contact_address_en:'91 BENCOOLEN STREET, #12-03, SUNSHINE PLAZA, SINGAPORE 189652',country_zh_cn:'新加坡',city:'',province:'',postcode:'189652'}]}]})
 const d=decision();d.warnings=['Applicant name missing in source data.','公开时间未识别，备注提示立即公开及展会展示']
 const r=applySourceFields(d,input)
 expect(r.applicant).toMatchObject({name:'EXAMPLE LIFE PTE. LTD.',city:'Singapore',region:'',country:'SG'})
 expect(r.publicationMonths).toBe(0);expect(r.warnings.join()).not.toMatch(/name missing|公开时间未识别|region 缺少/)
 expect(parsedHagueSource(input)).toMatchObject({applicants:[{name:'EXAMPLE LIFE PTE. LTD.',city:'Singapore',country:'SG'}]})
})
it('restores designer count and sourced English names while keeping one actionable warning per missing name',()=>{
 const input=source('海牙进入欧盟；立即公开',{GetCaseInventor:[{TableRows:[{inventor_name_cn:'测试甲'},{inventor_name_cn:'测试乙',first_name_en:'Jun',last_name_en:'CAO'},{inventor_name_cn:'测试丙',first_name_en:'Wenhai',last_name_en:'HUANG'}]}]})
 const d=decision();d.creators=[{givenName:'WRONG',familyName:'GUESS',address:d.applicant}];d.warnings=['缺少第1位设计人英文姓名来源','设计人姓或名缺失，请人工核对；未猜测拆分姓名。']
 const r=applySourceFields(d,input)
 expect(r.creators.map(c=>[c.givenName,c.familyName])).toEqual([['',''],['Jun','CAO'],['Wenhai','HUANG']])
 expect(r.warnings.filter(w=>/设计人|英文姓名/.test(w))).toHaveLength(1)
 expect(r.warnings.join()).toContain('测试甲')
})
it('keeps unknown real countries and case-specific conditional designation notes visible',()=>{
 expect(sourceRequirements(source('海牙进入欧盟、未知地区；公开方式：立即公开')).unrecognized).toContain('未知地区')
 expect(sourceRequirements(source('海牙进入美国35/523,448、Chile；立即公开')).unrecognized).toContain('Chile')
 const r=applySourceFields(decision(),source('海牙进入欧盟、英国；公开情况：立即公开\n2款产品，CM20H不申请美国和日本，CM20E需要全部申请。'))
 expect(r.parties).toEqual(['EM','GB']);expect(r.warnings.join()).toMatch(/款式|条件/)
})
