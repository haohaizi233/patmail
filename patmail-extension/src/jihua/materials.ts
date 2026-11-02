import type { Material, PatentType } from './types'

type MaterialDefinition = Pick<Material, 'key' | 'label' | 'appendixType' | 'field'> & {
  ofcType?: string
  group?: Material['group']
}

const definitions: MaterialDefinition[] = [
  { key: 'FIRST_RESULT', label: '首次检索报告文件', appendixType: 'FIRST_RESULT', field: 'firstResultAppendixList' },
  { key: 'MODIFY_TECHNICAL_DISCLOSURE', label: '提案名称-技术交底书-修改版', appendixType: 'MODIFY_TECHNICAL_DISCLOSURE', field: 'modifyTechnicalDisclosureAppendixList' },
  { key: 'FINAL_SEARCH_REPORT', label: '提案名称-检索报告-第二次或最终', appendixType: 'FINAL_SEARCH_REPORT', field: 'finalSearchReportAppendixList' },
  { key: 'FINAL_RESULT', label: '最终检索报告文件', appendixType: 'FINAL_RESULT', field: 'finalResultAppendixList' },
  { key: 'FAST_PROMISE', label: '快速预审承诺书', appendixType: 'FAST_PROMISE', field: 'fastPromiseAppendixList', group: 'fast' },
  { key: 'FAST_ACPT_NOTICE', label: '专利申请快速预审受理/不受理通知书', appendixType: 'FAST_ACPT_NOTICE', field: 'fastAcptNoticeAppendixList', ofcType: 'FETCH_NOTICE', group: 'fast' },
  { key: 'FAST_CHECK_REQ_NOTICE', label: '专利申请快速预审请求审查意见通知书', appendixType: 'FAST_CHECK_REQ_NOTICE', field: 'fastCheckReqNoticeAppendixList', group: 'fast' },
  { key: 'FAST_CHECK_REQ_PASS', label: '专利申请快速预审请求通过/不通过通知书', appendixType: 'FAST_CHECK_REQ_PASS', field: 'fastCheckReqPassAppendixList', group: 'fast' },
  { key: 'FINAL_TECHNICAL_DISCLOSURE', label: '终版的技术交底书', appendixType: 'FINAL_TECHNICAL_DISCLOSURE', field: 'finalTechnicalDisclosureAppendixList' },
  { key: 'FINAL_APPLICATION_DOCUMENTS', label: '申请文件终稿文件', appendixType: 'FINAL_APPLICATION_DOCUMENTS', field: 'finalApplicationDocumentsAppendixList' },
  { key: 'COMMIT_SASAC_REQUEST', label: '提交到国知局的请求书', appendixType: 'COMMIT_SASAC_REQUEST', field: 'commitSasacRequestAppendixList' },
  { key: 'COMMIT_SASAC_APPLY', label: '提交到国知局的申请文件', appendixType: 'COMMIT_SASAC_APPLY', field: 'commitSasacApplyAppendixList' },
  { key: 'ACPT_NOTICE', label: '专利申请受理通知书', appendixType: 'ACPT_NOTICE', field: 'acptNoticeAppendixList', ofcType: 'FETCH_PDF', group: 'general' },
  { key: 'FEE_REDUCTION_APPROVAL_NOTICE', label: '费用减缴通知书', appendixType: 'FEE_REDUCTION_APPROVAL_NOTICE', field: 'feeReductionApprovalNoticeAppendixList', group: 'general' },
  { key: 'FIRST_FIX', label: '第一次补正通知书', appendixType: 'FIRST_FIX', field: 'firstFixAppendixList', group: 'general' },
  { key: 'PATENT_REQUEST', label: '专利请求书', appendixType: 'PATENT_REQUEST', field: 'patentRequestAppendixList', group: 'general' },
  { key: 'APPLY_FILE', label: '申请文件', appendixType: 'APPLY_FILE', field: 'applyFileAppendixList', group: 'general' },
  { key: 'FIRST_CHECK_PASS_NOTICE', label: '发明专利申请初步审查合格通知书', appendixType: 'FIRST_CHECK_PASS_NOTICE', field: 'firstCheckPassNoticeAppendixList' },
  { key: 'SUB_EXAM_PHASE_NOTICE', label: '发明专利申请公布通知书', appendixType: 'SUB_EXAM_PHASE_NOTICE', field: 'subExamPhaseNoticeAppendixList', ofcType: 'FETCH_PUBTIME' },
  { key: 'EXA_STAGE_NOTICE', label: '发明专利申请进入实质审查阶段通知书', appendixType: 'EXA_STAGE_NOTICE', field: 'exaStageNoticeAppendixList', ofcType: 'FETCH_ISSUETIME' },
  { key: 'REVIEW_NOTICE', label: '审查意见通知书', appendixType: 'REVIEW_NOTICE', field: 'reviewNoticeAppendixList' },
  { key: 'OPINION_STATEMENT', label: '意见陈述书', appendixType: 'OPINION_STATEMENT', field: 'opinionStatementAppendixList' },
  { key: 'CLAIM', label: '权利要求或说明书替换页', appendixType: 'CLAIM', field: 'claimAppendixList' },
  { key: 'PRIORITY_REVIEW_RESULT_NOTICE', label: '优先审查结果通知书', appendixType: 'PRIORITY_REVIEW_RESULT_NOTICE', field: 'priorityReviewResultNoticeAppendixList', ofcType: 'FETCH_REVIEWRESULT', group: 'review' },
  { key: 'PRIORITY_REVIEW_REQ', label: '专利申请优先审查请求书', appendixType: 'PRIORITY_REVIEW_REQ', field: 'priorityReviewReqAppendixList', group: 'review' },
  { key: 'PRIORITY_REVIEW_PROXY', label: '优先审查代理委托书', appendixType: 'PRIORITY_REVIEW_PROXY', field: 'priorityReviewProxyAppendixList', group: 'review' },
  { key: 'PRIORITY_REVIEW_PROOF', label: '优先审查证明文件说明', appendixType: 'PRIORITY_REVIEW_PROOF', field: 'priorityReviewProofAppendixList', group: 'review' },
  { key: 'CORP_CERTIFICATE', label: '事业单位法人证书', appendixType: 'CORP_CERTIFICATE', field: 'corpCertificateAppendixList', group: 'review' },
  { key: 'PRIORITY_REVIEW_NOTICE', label: '专利申请予以优先审查通知书', appendixType: 'PRIORITY_REVIEW_NOTICE', field: 'priorityReviewNoticeAppendixList', group: 'review' },
  { key: 'GRANT_NOTICE', label: '授予发明权利权通知书', appendixType: 'GRANT_NOTICE', field: 'grantNoticeAppendixList' },
  { key: 'REGISTRATION_NOTICE', label: '办理登记手续通知书', appendixType: 'REGISTRATION_NOTICE', field: 'registrationNoticeAppendixList' },
  { key: 'STATUS_RIGHT', label: '发明专利证书', appendixType: 'STATUS_RIGHT', field: 'statusRightAppendixList', ofcType: 'FETCH_AUTHORTIME' },
  { key: 'REJECT_DECISION', label: '驳回决定', appendixType: 'REJECT_DECISION', field: 'rejectDecisionAppendixList', ofcType: 'FETCH_REJECTTIME' },
  { key: 'REJECT_REPORT', label: '驳回分析报告', appendixType: 'REJECT_REPORT', field: 'rejectReportAppendixList' },
  { key: 'REGARD_AS_REVOKE', label: '视为撤回通知书', appendixType: 'REGARD_AS_REVOKE', field: 'regardAsRevokeAppendixList' },
  { key: 'COMPLIANCE_NOTICE', label: '手续合格通知书', appendixType: 'COMPLIANCE_NOTICE', field: 'complianceNoticeAppendixList' },
  { key: 'TRANSFER_PRO_QUALIFIED', label: '转让手续合格通知书', appendixType: 'TRANSFER_PRO_QUALIFIED', field: 'transferProQualifiedAppendixList' },
  { key: 'EXP_INVOICE', label: '发票', appendixType: 'EXP_INVOICE', field: 'expInvoiceAppendixList' },
  { key: 'FUND_REQ', label: '请款单', appendixType: 'FUND_REQ', field: 'fundReqAppendixList' },
]

const UTILITY_MATERIAL_KEYS = new Set([
  'FIRST_RESULT',
  'MODIFY_TECHNICAL_DISCLOSURE',
  'FINAL_SEARCH_REPORT',
  'FINAL_RESULT',
  'COMMIT_SASAC_REQUEST',
  'COMMIT_SASAC_APPLY',
  'ACPT_NOTICE',
  'FEE_REDUCTION_APPROVAL_NOTICE',
  'FIRST_FIX',
  'PATENT_REQUEST',
  'APPLY_FILE',
  'FIRST_CHECK_PASS_NOTICE',
  'REVIEW_NOTICE',
  'OPINION_STATEMENT',
  'CLAIM',
  'PRIORITY_REVIEW_RESULT_NOTICE',
  'PRIORITY_REVIEW_REQ',
  'PRIORITY_REVIEW_PROXY',
  'PRIORITY_REVIEW_PROOF',
  'CORP_CERTIFICATE',
  'PRIORITY_REVIEW_NOTICE',
  'GRANT_NOTICE',
  'REGISTRATION_NOTICE',
  'STATUS_RIGHT',
  'REJECT_DECISION',
  'REJECT_REPORT',
  'REGARD_AS_REVOKE',
  'COMPLIANCE_NOTICE',
  'EXP_INVOICE',
  'FUND_REQ',
])

export const MATERIALS: Material[] = definitions.map(definition => ({
  ...definition,
  limit: definition.ofcType ? 1 : 10,
  types: UTILITY_MATERIAL_KEYS.has(definition.key) ? ['INVENTION', 'UTILITY'] : ['INVENTION'],
}))

export const ATTACHMENT_FIELDS: string[] = [
  'firstResultAppendixList',
  'modifyTechnicalDisclosureAppendixList',
  'finalSearchReportAppendixList',
  'finalResultAppendixList',
  'fastPromiseAppendixList',
  'fastAcptNoticeAppendixList',
  'fastCheckReqFixAppendixList',
  'fastCheckReqNoticeAppendixList',
  'fastCheckReqPassAppendixList',
  'finalTechnicalDisclosureAppendixList',
  'finalApplicationDocumentsAppendixList',
  'commitSasacRequestAppendixList',
  'commitSasacApplyAppendixList',
  'acptNoticeAppendixList',
  'feeReductionApprovalNoticeAppendixList',
  'firstFixAppendixList',
  'patentRequestAppendixList',
  'applyFileAppendixList',
  'firstCheckPassNoticeAppendixList',
  'subExamPhaseNoticeAppendixList',
  'exaStageNoticeAppendixList',
  'reviewNoticeAppendixList',
  'opinionStatementAppendixList',
  'claimAppendixList',
  'priorityReviewResultNoticeAppendixList',
  'priorityReviewReqAppendixList',
  'priorityReviewProxyAppendixList',
  'priorityReviewProofAppendixList',
  'corpCertificateAppendixList',
  'priorityReviewNoticeAppendixList',
  'grantNoticeAppendixList',
  'registrationNoticeAppendixList',
  'statusRightAppendixList',
  'rejectDecisionAppendixList',
  'rejectReportAppendixList',
  'regardAsRevokeAppendixList',
  'complianceNoticeAppendixList',
  'transferProQualifiedAppendixList',
  'expInvoiceAppendixList',
  'fundReqAppendixList',
]

const materialsByKey = new Map(MATERIALS.map(material => [material.key, material]))
const sourceAliasEntries = [
  ['递交合并档', 'PATENT_REQUEST'],
  ['递交文件合并档', 'PATENT_REQUEST'],
  ['新申请文档', 'APPLY_FILE'],
  ['费用减缴审批通知书', 'FEE_REDUCTION_APPROVAL_NOTICE'],
  ['手续合格通知书(著录项目变更)', 'COMPLIANCE_NOTICE'],
  ['实用新型专利证书', 'STATUS_RIGHT'],
  ['实用新型专利证书(签章)', 'STATUS_RIGHT'],
  ['发明专利证书(签章)', 'STATUS_RIGHT'],
] as const
const aliases = new Map<string, string>(sourceAliasEntries)
export const SOURCE_MATERIAL_ALIASES = sourceAliasEntries.map(([description]) => description)

function normalizeDescription(description: string): string {
  return description.trim().replace(/[（]/g, '(').replace(/[）]/g, ')').replace(/\s+/g, '')
}

export function normalizeApplicationNo(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '').replace(/^CN/, '').replace(/[.-]/g, '')
}

export function matchMaterialAlias(description: string): Material | undefined {
  const aliasKey = aliases.get(normalizeDescription(description))
  return aliasKey ? materialsByKey.get(aliasKey) : undefined
}

export function matchMaterial(description: string): Material | undefined {
  const normalized = normalizeDescription(description)
  const alias = matchMaterialAlias(normalized)
  if (alias) return alias

  const exact = MATERIALS.find(material => normalizeDescription(material.label) === normalized)
  if (exact) return exact

  if (/^第(?:\d+|[Nn]|[一二三四五六七八九十百零〇两]+)次审查意见通知书$/.test(normalized)) {
    return materialsByKey.get('REVIEW_NOTICE')
  }
  return undefined
}

export function materialByKey(key: string): Material | undefined {
  return materialsByKey.get(key)
}

export function materialForType(material: Material, type: PatentType): Material | undefined {
  if (!material.types?.includes(type)) return undefined
  const utilityOfcDisabled = type === 'UTILITY' && (material.key === 'STATUS_RIGHT' || material.key === 'REJECT_DECISION')
  const ofcType = utilityOfcDisabled ? undefined : material.ofcType
  return { ...material, ofcType, limit: ofcType ? 1 : 10 }
}

export function attachmentFieldsForType(type: PatentType): string[] {
  if (type === 'INVENTION') return [...ATTACHMENT_FIELDS]
  const fields = MATERIALS.filter(material => material.types?.includes(type)).map(material => material.field)
  fields.push('subExamPhaseNoticeAppendixList')
  return [...new Set(fields)]
}
