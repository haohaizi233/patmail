import { describe, expect, it } from 'vitest'
import { ATTACHMENT_FIELDS, MATERIALS, attachmentFieldsForType, matchMaterial, materialByKey, materialForType, normalizeApplicationNo } from '../../../src/jihua/materials'

describe('Jihua material mapping', () => {
  it('normalizes China application numbers, punctuation, and lowercase check digits', () => {
    expect(normalizeApplicationNo(' CN2021.11140279.x ')).toBe('202111140279X')
    expect(normalizeApplicationNo('2018.10991552.1')).toBe('2018109915521')
  })

  it('includes the 39 visible mappings and the reserved fortieth attachment field', () => {
    expect(MATERIALS).toHaveLength(39)
    expect(ATTACHMENT_FIELDS).toHaveLength(40)
    expect(ATTACHMENT_FIELDS).toContain('fastCheckReqFixAppendixList')
    expect(MATERIALS.every(material => material.types?.includes('INVENTION'))).toBe(true)
    expect(materialByKey('REVIEW_NOTICE')?.field).toBe('reviewNoticeAppendixList')
  })

  it('maps explicit source aliases to the verified platform materials', () => {
    expect(matchMaterial('递交合并档')?.key).toBe('PATENT_REQUEST')
    expect(matchMaterial('递交文件合并档')?.key).toBe('PATENT_REQUEST')
    expect(matchMaterial('新申请文档')?.key).toBe('APPLY_FILE')
    expect(matchMaterial('费用减缴审批通知书')?.key).toBe('FEE_REDUCTION_APPROVAL_NOTICE')
    expect(matchMaterial('手续合格通知书（著录项目变更）')?.key).toBe('COMPLIANCE_NOTICE')
    expect(matchMaterial('实用新型专利证书')?.key).toBe('STATUS_RIGHT')
    expect(matchMaterial('实用新型专利证书（签章）')?.key).toBe('STATUS_RIGHT')
    expect(matchMaterial('发明专利证书(签章)')?.key).toBe('STATUS_RIGHT')
    expect(matchMaterial('第一次审查意见通知书')?.key).toBe('REVIEW_NOTICE')
    expect(matchMaterial('第12次审查意见通知书')?.key).toBe('REVIEW_NOTICE')
    expect(matchMaterial('第N次审查意见通知书')?.key).toBe('REVIEW_NOTICE')
    expect(matchMaterial('第n次审查意见通知书')?.key).toBe('REVIEW_NOTICE')
  })

  it('does not map unrecognized descriptions by a vague keyword', () => {
    expect(matchMaterial('其他通知书')).toBeUndefined()
    expect(matchMaterial('审查业务专用函')).toBeUndefined()
    expect(matchMaterial('缴费通知书')).toBeUndefined()
    expect(matchMaterial('发明专利申请公布及进入实质审查阶段通知书')).toBeUndefined()
    expect(matchMaterial('第N次补正通知书')).toBeUndefined()
  })

  it('applies the verified utility model material and attachment field scope', () => {
    const rightCertificate = materialByKey('STATUS_RIGHT')!
    const rejection = materialByKey('REJECT_DECISION')!
    const receipt = materialByKey('ACPT_NOTICE')!

    expect(MATERIALS.filter(material => material.types?.includes('UTILITY'))).toHaveLength(30)
    expect(materialForType(rightCertificate, 'UTILITY')).toMatchObject({ limit: 10, ofcType: undefined })
    expect(materialForType(rejection, 'UTILITY')).toMatchObject({ limit: 10, ofcType: undefined })
    expect(materialForType(receipt, 'UTILITY')).toMatchObject({ limit: 1, ofcType: 'FETCH_PDF' })
    expect(materialForType(materialByKey('FAST_PROMISE')!, 'UTILITY')).toBeUndefined()
    expect(attachmentFieldsForType('UTILITY')).toHaveLength(31)
    expect(attachmentFieldsForType('UTILITY')).toContain('subExamPhaseNoticeAppendixList')
  })

  it('assigns group flags only to fields gated by the source form', () => {
    expect(materialByKey('FIRST_RESULT')?.group).toBeUndefined()
    expect(materialByKey('STATUS_RIGHT')?.group).toBeUndefined()
    expect(materialByKey('PATENT_REQUEST')?.group).toBe('general')
    expect(materialByKey('FAST_PROMISE')?.group).toBe('fast')
    expect(materialByKey('PRIORITY_REVIEW_REQ')?.group).toBe('review')
  })
})
