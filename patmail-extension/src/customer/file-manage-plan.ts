import { isQueryGuid } from '../query/query-validator'
import { createFileDescriptionLeafResolver } from '../mail/rules/file-description-leaf'
import { pageSelectOptions } from '../query/form-page'
import type { TreeOption } from '../query/option-tree'
import { buildSubject } from '../mail/rules/subject-builder'
import type { DescriptionMailTypeMapping, MailGroup, SubjectRule } from '../mail/types'
import type { FileMailStyle } from './types'

export const FILE_MANAGE_BATCH = 20

export interface FileManageFile {
  fileId: string
  fileName: string
  fileDescription: string
  fileDescriptionCode?: string
  fileType?: string
  applicationType?: string
  customerName: string
  caseVolume?: string
  customerVolume?: string
  caseName?: string
  applicationNo?: string
  officialPostDate?: string
}

export interface FileManageLetterPlan {
  key: string
  files: FileManageFile[]
  description: string
  applicationType: string
  mailTypeId: string
  mailTypeName: string
  subject: string
  descriptionFallback?: string
  descriptionConflict?: string
  mappingChoices?: FileManageMappingChoice[]
  selectedMappingKey?: string
  /** 非空时这一封不创建、不提交。 */
  blocked: string
}

export interface FileManageMappingChoice {
  key: string
  descriptionId: string
  descriptionPath: string
  mailTypeId: string
  mailTypeName: string
}

const BAD_ADDRESS = /[();；]/

/** 把发文页下拉里的签名 HTML 写进正文。已经有同样一段时不再加一次。 */
export function bodyWithSignature(body: string, signatureHtml: string): string {
  const sign = signatureHtml.trim()
  const text = body.trim()
  if (!sign) return text
  if (text.includes(sign)) return text
  return text ? `${text}<br><br>${sign}` : sign
}

export function sameCustomerName(left: string, right: string): boolean {
  return left.replace(/\s+/g, '') === right.replace(/\s+/g, '')
}

/** 默认发件人要能写成「名称(邮箱);」。标签形如 名称<邮箱> 时也能拆开。 */
export function senderAddress(sender: { name?: string; email?: string; label?: string } | null | undefined): { name: string; email: string } | null {
  if (!sender) return null
  const directName = sender.name?.trim() ?? ''
  const directEmail = sender.email?.trim() ?? ''
  if (directName && directEmail.includes('@') && !BAD_ADDRESS.test(directName) && !BAD_ADDRESS.test(directEmail)) {
    return { name: directName, email: directEmail }
  }
  const label = sender.label?.trim() ?? ''
  const angle = label.match(/^(.*)<([^<>]+)>$/)
  const name = angle?.[1]?.trim() ?? ''
  const email = angle?.[2]?.trim() ?? ''
  if (!name || !email.includes('@') || BAD_ADDRESS.test(name) || BAD_ADDRESS.test(email)) return null
  return { name, email }
}

function groupOf(key: string, description: string, files: FileManageFile[], mode: FileMailStyle, leafId?: string): MailGroup {
  return {
    id: key,
    customerProfileId: '',
    customerIdentity: '',
    descriptionIdentity: leafId ? `id:${leafId}` : '',
    descriptionLabel: description,
    sendMode: mode,
    policyVersion: 0,
    files: files.map(file => ({
      fileId: file.fileId,
      fileName: file.fileName,
      fileDescription: file.fileDescription,
      customerName: file.customerName,
      ...(file.caseVolume ? { caseVolume: file.caseVolume } : {}),
      ...(file.customerVolume ? { customerVolume: file.customerVolume } : {}),
      ...(file.caseName ? { caseName: file.caseName } : {}),
      ...(file.applicationNo ? { applicationNo: file.applicationNo } : {}),
      ...(file.officialPostDate ? { officialPostDate: file.officialPostDate } : {})
    }))
  }
}

function blockFile(file: FileManageFile): string {
  if (!isQueryGuid(file.fileId)) return '文件编号不是内部编号，不能创建。'
  if (!file.fileName.trim() || file.fileName.includes(';') || file.fileName.length > 180) return '文件名不能按分号提交。'
  return ''
}

function subjectOf(rule: SubjectRule | null, group: MailGroup, customerName: string, mailTypeName: string, now?: Date): { text: string; blocked: string } {
  if (!rule?.template.trim()) return { text: '', blocked: '还没有标题模板。' }
  const built = buildSubject(rule, group, customerName, { mailTypeName, ...(now ? { now } : {}) })
  if (built.unresolved.length) return { text: built.text, blocked: `标题里的 {${built.unresolved[0]}} 还没有对应内容。` }
  if (built.needsConfirm) return { text: built.text, blocked: '标题模板要求先确认件数，这一封没有创建。' }
  if (!built.text.trim()) return { text: '', blocked: '标题是空的，没有创建。' }
  return { text: built.text.trim().slice(0, 500), blocked: '' }
}

/** 同一客户下，按发文方式把文件收成一封封。发文类型由文件描述映射决定。 */
export function planFileManageLetters(input: {
  customerName: string
  mailStyle: FileMailStyle
  files: FileManageFile[]
  mappings: DescriptionMailTypeMapping[]
  descriptionNodes?: TreeOption[]
  mappingSelections?: Record<string, string>
  subject: SubjectRule | null
  hasSender: boolean
  hasReviewer: boolean
  hasSignature: boolean
  now?: Date
}): { letters: FileManageLetterPlan[]; notes: string[] } {
  const notes: string[] = []
  const kept: FileManageFile[] = []
  let others = 0
  for (const file of input.files) {
    const name = file.customerName.trim()
    if (name && !sameCustomerName(name, input.customerName)) {
      others += 1
      continue
    }
    kept.push(file)
  }
  if (others) notes.push(`有 ${others} 个文件不是这位客户，没有放进来。`)
  const resolveLeaf = createFileDescriptionLeafResolver(input.descriptionNodes ?? pageSelectOptions('filetype') ?? [])
  const rulesByLeaf = new Map<string, DescriptionMailTypeMapping[]>()
  for (const rule of input.mappings) {
    if (!rule.enabled || !isQueryGuid(rule.mailTypeId)) continue
    const id = rule.fileDescriptionId?.trim().toLowerCase() ||
      resolveLeaf({ fileDescription: rule.fileDescriptionText }).leaf?.id
    if (!id) continue
    const rules = rulesByLeaf.get(id) ?? []
    rules.push(rule)
    rulesByLeaf.set(id, rules)
  }
  type Leaf = NonNullable<ReturnType<typeof resolveLeaf>['leaf']>
  function choicesFor(leaf: Leaf): FileManageMappingChoice[] {
    const candidates = rulesByLeaf.get(leaf.id) ?? []
    const explicit = candidates.filter(rule => rule.fileDescriptionId?.trim())
    const choices = new Map<string, FileManageMappingChoice>()
    for (const rule of explicit.length ? explicit : candidates) {
      const key = `${leaf.id}/${rule.mailTypeId.toLowerCase()}`
      if (!choices.has(key)) choices.set(key, {
        key, descriptionId: leaf.id, descriptionPath: leaf.path,
        mailTypeId: rule.mailTypeId, mailTypeName: rule.mailTypeName.trim() || '已映射的发文类型'
      })
    }
    return [...choices.values()]
  }
  const buckets = new Map<string, {
    files: FileManageFile[]
    leaf: Leaf | null
    matched?: FileManageMappingChoice
    descriptionConflict?: string
    mappingChoices?: FileManageMappingChoice[]
    selectedMappingKey?: string
  }>()
  for (const file of kept) {
    const resolved = resolveLeaf(file)
    const choices = resolved.candidates.flatMap(choicesFor)
    const ambiguous = resolved.ambiguous || choices.length > 1
    const chosen = ambiguous ? choices.find(choice => choice.key === input.mappingSelections?.[file.fileId.toLowerCase()]) : undefined
    const leaf = chosen ? resolved.candidates.find(item => item.id === chosen.descriptionId) ?? null : resolved.leaf
    const matched = ambiguous ? chosen : choices[0]
    const descriptionConflict = !ambiguous || chosen ? undefined : resolved.ambiguous
      ? '这个文件描述在原站树里有多个叶子候选，文书编号或所属分支不足以区分。'
      : '这个文件描述对上了多种发文类型，没有创建。'
    const key = input.mailStyle === 'single_file' || !leaf || ambiguous
      ? `single:${file.fileId || file.fileName}`
      : `merge:${leaf.id}`
    const bucket = buckets.get(key) ?? {
      files: [], leaf, matched, descriptionConflict,
      mappingChoices: ambiguous && choices.length ? choices : undefined,
      selectedMappingKey: chosen?.key
    }
    bucket.files.push(file)
    buckets.set(key, bucket)
  }
  const letters: FileManageLetterPlan[] = []
  for (const [key, { files, leaf, matched, descriptionConflict, mappingChoices, selectedMappingKey }] of buckets) {
    const description = files[0]?.fileDescription.trim() ?? ''
    const applicationType = [...new Set(files.map(file => file.applicationType?.trim() || '—'))].join('、')
    const fileBlock = files.map(blockFile).find(Boolean) ?? ''
    const mailTypeId = matched?.mailTypeId ?? ''
    const mailTypeName = matched?.mailTypeName ?? ''
    const descriptionFallback = matched && leaf && !selectedMappingKey && files.some(file => !file.fileDescriptionCode && file.fileDescription.trim() !== leaf.label)
      ? leaf.label : undefined
    const subject = subjectOf(input.subject, groupOf(key, description || leaf?.label || '', files, input.mailStyle, leaf?.id), input.customerName, mailTypeName, input.now)
    const blocked = fileBlock
      || descriptionConflict
      || (!description && !leaf ? '文件描述是空的，没有对上发文类型。' : '')
      || (!matched ? '发文映射里没有这个文件描述的可用叶子规则。' : '')
      || (!input.hasSender ? '还没有默认发件人。到发文映射里设一个。' : '')
      || (!input.hasReviewer ? '还没有默认审核人。到发文映射里设一个。' : '')
      || (!input.hasSignature ? '还没有默认签名。到发文映射里设一个。' : '')
      || subject.blocked
    letters.push({
      key,
      files,
      description,
      applicationType,
      mailTypeId,
      mailTypeName,
      subject: subject.text,
      ...(descriptionFallback ? { descriptionFallback } : {}),
      ...(descriptionConflict ? { descriptionConflict } : {}),
      ...(mappingChoices ? { mappingChoices } : {}),
      ...(selectedMappingKey ? { selectedMappingKey } : {}),
      blocked
    })
  }
  letters.sort((left, right) => left.description < right.description ? -1 : left.description > right.description ? 1 : left.key < right.key ? -1 : 1)
  return { letters, notes }
}
