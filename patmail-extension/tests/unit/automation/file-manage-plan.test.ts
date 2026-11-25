import { isContentRequest, MessageType } from '../../../src/shared/message'
import { describe, expect, it } from 'vitest'
import { bodyWithSignature, planFileManageLetters, senderAddress } from '../../../src/customer/file-manage-plan'
import { classifyMailFlow, fileManageSubmitShouldHalt, formatPeople, matchConfiguredReviewer, nextFileManageAttempt } from '../../../src/customer/file-manage-submit'
import type { DescriptionMailTypeMapping, SubjectRule } from '../../../src/mail/types'
import type { WorkflowNode } from '../../../src/workflow/types'
import { buildMailCustomerParams } from '../../../src/mail/easy/contracts'
import type { MailDraftPreview } from '../../../src/mail/types'

const fileId = '71d067a3-d1a3-4d4b-87f9-38ea9d96bf70'
const typeId = '82e178b4-e2b4-4e5c-98fa-49fb0ea7cf81'
const otherType = '93f289c5-f3c5-4f6d-a90b-50ac1fb8d092'
const testDescriptionNodes = [{ value: '11111111-1111-4111-8111-111111111111', label: '专利证书' }]

const subject: SubjectRule = {
  template: '{客户名称}-{文件描述}-{发文类型}',
  countInjection: false,
  anchor: '',
  missingAnchor: 'keep',
  version: 1
}

function mapping(text: string, mailTypeId: string): DescriptionMailTypeMapping {
  return {
    id: `map-${text}-${mailTypeId}`,
    fileDescriptionText: text,
    mailTypeId,
    mailTypeName: '专利电子证书',
    enabled: true,
    version: 1,
    updatedAt: '2026-10-08T00:00:00.000Z'
  }
}

describe('文件管理工作流规划', () => {
  it('同名叶子按查询返回的文书编号和文件分支分开匹配和合并', () => {
    const description = '按照条约第19条修改的权利要求书'
    const label = description + '(150127)'
    const submitted = 'D97348DE-F8DC-4B99-9B6E-0B4AA406FC13'
    const internal = 'E9B68288-1B01-4139-92A3-D875F2FFE6DA'
    const file = { fileId, fileName: '甲.pdf', fileDescription: description, fileDescriptionCode: '150127', customerName: '甲' }
    const plan = planFileManageLetters({
      customerName: '甲', mailStyle: 'merge_by_customer_description',
      files: [
        { ...file, fileType: '递交官方' },
        { ...file, fileId: otherType, fileType: '本所文件' },
        { ...file, fileId: typeId }
      ],
      mappings: [
        { ...mapping(label, typeId), fileDescriptionId: submitted },
        { ...mapping(label, otherType), fileDescriptionId: internal }
      ],
      subject, hasSender: true, hasReviewer: true, hasSignature: true
    })
    expect(plan.letters).toHaveLength(3)
    expect(plan.letters.find(letter => letter.files[0]?.fileId === fileId)?.mailTypeId).toBe(typeId)
    expect(plan.letters.find(letter => letter.files[0]?.fileId === otherType)?.mailTypeId).toBe(otherType)
    expect(plan.letters.find(letter => letter.files[0]?.fileId === typeId)?.descriptionConflict).toContain('多个叶子候选')
  })

  it('只给当前文件采用所选叶子映射，已失效的选择仍拦截', () => {
    const label = '电子提交收据'
    const leafIds = ['25b78593-aa1a-4b4d-b0d1-67897b6e4e42', '4e5b8e90-49c1-4fd7-a6ed-d3142d07be07']
    const base = { fileId, fileName: '收据.pdf', fileDescription: label, fileType: '官方来文', applicationType: '发明', customerName: '甲' }
    const input = {
      customerName: '甲', mailStyle: 'merge_by_customer_description' as const,
      files: [base, { ...base, fileId: otherType, applicationType: '实用新型' }],
      mappings: leafIds.map((fileDescriptionId, index) => ({ ...mapping(label, index ? otherType : typeId), fileDescriptionId })),
      subject, hasSender: true, hasReviewer: true, hasSignature: true
    }
    const pending = planFileManageLetters(input)
    expect(pending.letters[0]?.mappingChoices?.map(choice => choice.descriptionId)).toEqual(leafIds)
    const choice = pending.letters[0]?.mappingChoices?.[1]
    const selected = planFileManageLetters({ ...input, mappingSelections: { [fileId]: choice?.key ?? '' } })
    expect(selected.letters[0]).toMatchObject({ applicationType: '发明', mailTypeId: otherType, selectedMappingKey: choice?.key, blocked: '' })
    expect(selected.letters[1]).toMatchObject({ applicationType: '实用新型', mailTypeId: '' })
    const stale = planFileManageLetters({ ...input, mappings: input.mappings.slice(0, 1), mappingSelections: { [fileId]: choice?.key ?? '' } })
    expect(stale.letters[0]?.descriptionConflict).toContain('多个叶子候选')
  })

  it('已配置叶子 ID 时优先采用该规则，旧文本只在未配置该叶子时兼容', () => {
    const plan = planFileManageLetters({
      customerName: '甲', mailStyle: 'single_file', descriptionNodes: testDescriptionNodes,
      files: [{ fileId, fileName: '甲.pdf', fileDescription: '专利证书', customerName: '甲' }],
      mappings: [
        mapping('专利证书', otherType),
        { ...mapping('专利证书', typeId), fileDescriptionId: testDescriptionNodes[0].value }
      ],
      subject, hasSender: true, hasReviewer: true, hasSignature: true
    })
    expect(plan.letters[0]?.mailTypeId).toBe(typeId)
  })
  it('同一分支的同名节点在树里没有可区分的编号时仍提示歧义', () => {
    const label = '电子提交收据'
    const plan = planFileManageLetters({
      customerName: '甲', mailStyle: 'single_file',
      files: [{ fileId, fileName: '收据.pdf', fileDescription: label, fileDescriptionCode: '123456', fileType: '官方来文', customerName: '甲' }],
      mappings: [{ ...mapping(label, typeId), fileDescriptionId: '25b78593-aa1a-4b4d-b0d1-67897b6e4e42' }],
      subject, hasSender: true, hasReviewer: true, hasSignature: true
    })
    expect(plan.letters[0]?.descriptionConflict).toContain('多个叶子候选')
    expect(plan.letters[0]?.mailTypeId).toBe('')
  })
  it.each([
    { rules: [mapping('发明专利证书(签章)(400001CA)', typeId)], type: typeId, blocked: '' },
    { rules: [mapping('发明专利证书(签章)(400001CA)', typeId), mapping('发明专利证书(签章)', typeId)], type: typeId, blocked: '' },
    { rules: [mapping('发明专利证书(签章)(400001CA)', otherType), mapping('发明专利证书(签章)', typeId)], type: '', blocked: '这个文件描述对上了多种发文类型，没有创建。' },
    { rules: [mapping('发明专利证书(400001)', typeId)], type: '', blocked: '发文映射里没有这个文件描述的可用叶子规则。' }
  ])('按证书描述的编号兼容关系匹配并拦截冲突 %#', ({ rules, type, blocked }) => {
    const plan = planFileManageLetters({
      customerName: '甲', mailStyle: 'single_file',
      files: [{ fileId, fileName: '甲.pdf', fileDescription: '发明专利证书(签章)', customerName: '甲' }],
      mappings: rules, subject, hasSender: true, hasReviewer: true, hasSignature: true
    })
    expect(plan.letters[0]).toMatchObject({ mailTypeId: type, blocked })
    const letter = plan.letters[0]
    const fallback = !blocked ? '发明专利证书(签章)(400001CA)' : undefined
    expect(letter?.descriptionFallback).toBe(fallback)
    expect(letter?.descriptionConflict).toBe(blocked.includes('多种发文类型') ? blocked : undefined)
  })

  it.each([
    ['驳回决定(200305)', [mapping('驳回决定(200305)', typeId), mapping('驳回决定(210407)', otherType)], typeId],
    ['驳回决定', [mapping('驳回决定(200305)', typeId)], '']
  ] as const)('保留精确编号，描述树有多候选时不猜测 %s', (fileDescription, mappings, expected) => {
    const plan = planFileManageLetters({
      customerName: '甲', mailStyle: 'single_file',
      files: [{ fileId, fileName: '甲.pdf', fileDescription, customerName: '甲' }],
      mappings: [...mappings], subject, hasSender: true, hasReviewer: true, hasSignature: true
    })
    expect(plan.letters[0]?.mailTypeId).toBe(expected)
    if (!expected) expect(plan.letters[0]?.descriptionConflict).toContain('多个叶子候选')
  })

  it('旧客户类型覆盖不能绕过固定映射缺失检查', () => {
    const input = {
      customerName: '甲', mailStyle: 'single_file' as const,
      files: [{ fileId, fileName: '甲.pdf', fileDescription: '未映射描述', customerName: '甲' }],
      mappings: [], mailTypeOverride: { id: typeId, name: '客户专属类型' },
      subject: { ...subject, template: '{客户名称}-{发文类型}' },
      hasSender: true, hasReviewer: true, hasSignature: true
    }
    const planned = planFileManageLetters(input)
    expect(planned.letters[0]?.blocked).toContain('发文映射里没有')
    expect(planned.letters[0]?.mailTypeId).toBe('')
  })

  it('单个来文逐文件规划，同描述也各自用原站 mailstyle=2 提交', () => {
    const planned = planFileManageLetters({
      customerName: '甲',
      mailStyle: 'single_file',
      files: [
        { fileId, fileName: '甲.pdf', fileDescription: '专利证书', customerName: '甲' },
        { fileId: otherType, fileName: '乙.pdf', fileDescription: '专利证书', customerName: '甲' }
      ],
      mappings: [mapping('专利证书', typeId)],
      descriptionNodes: testDescriptionNodes,
      subject,
      hasSender: true,
      hasReviewer: true,
      hasSignature: true
    })
    expect(planned.letters).toHaveLength(2)
    for (const letter of planned.letters) {
      expect(letter.blocked).toBe('')
      expect(letter.files).toHaveLength(1)
      const result = buildMailCustomerParams({
        sendMode: 'single_file',
        mailTypeId: letter.mailTypeId,
        fileIds: letter.files.map(file => file.fileId),
        files: letter.files
      } as MailDraftPreview)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.params.get('mailstyle')).toBe('2')
        expect(result.params.get('_file_ids')).toBe(letter.files[0]?.fileId)
        expect(result.params.get('_file_names')).toBe(letter.files[0]?.fileName)
      }
    }
  })

  it('同一文件描述合成一封，类型、标题按映射和模板', () => {
    const planned = planFileManageLetters({
      customerName: '鹏城实验室',
      mailStyle: 'merge_by_customer_description',
      files: [
        { fileId, fileName: '甲.pdf', fileDescription: '专利证书', customerName: '鹏城实验室', caseVolume: 'PA1' },
        { fileId: 'a2e178b4-e2b4-4e5c-98fa-49fb0ea7cf81', fileName: '乙.pdf', fileDescription: '专利证书', customerName: '鹏城 实验室' }
      ],
      mappings: [mapping('专利证书', typeId)],
      descriptionNodes: testDescriptionNodes,
      subject,
      hasSender: true,
      hasReviewer: true,
      hasSignature: true,
      now: new Date('2026-10-08T00:00:00.000Z')
    })
    expect(planned.letters).toHaveLength(1)
    expect(planned.letters[0]).toMatchObject({
      mailTypeId: typeId,
      mailTypeName: '专利电子证书',
      subject: '鹏城实验室-专利证书-专利电子证书',
      blocked: ''
    })
    expect(planned.letters[0]?.files).toHaveLength(2)
  })

  it('一个描述对上多种发文类型时不创建', () => {
    const planned = planFileManageLetters({
      customerName: '甲',
      mailStyle: 'merge_by_customer_description',
      files: [{ fileId, fileName: '甲.pdf', fileDescription: '专利证书', customerName: '甲' }],
      mappings: [mapping('专利证书', typeId), mapping('专利证书', otherType)],
      descriptionNodes: testDescriptionNodes,
      subject,
      hasSender: true,
      hasReviewer: true,
      hasSignature: true
    })
    expect(planned.letters[0]?.blocked).toContain('多种发文类型')
  })

  it('别的客户的文件不放进来', () => {
    const planned = planFileManageLetters({
      customerName: '甲',
      mailStyle: 'merge_by_customer_description',
      files: [{ fileId, fileName: '甲.pdf', fileDescription: '专利证书', customerName: '乙' }],
      mappings: [mapping('专利证书', typeId)],
      descriptionNodes: testDescriptionNodes,
      subject,
      hasSender: true,
      hasReviewer: true,
      hasSignature: true
    })
    expect(planned.letters).toHaveLength(0)
    expect(planned.notes[0]).toContain('不是这位客户')
  })

  it('签名按 HTML 写进正文，已有同样一段时不再加', () => {
    expect(bodyWithSignature('<p>您好</p>', '<div>此致<br>敬礼</div>')).toBe('<p>您好</p><br><br><div>此致<br>敬礼</div>')
    expect(bodyWithSignature('<p>您好</p><br><br><div>此致<br>敬礼</div>', '<div>此致<br>敬礼</div>')).toBe('<p>您好</p><br><br><div>此致<br>敬礼</div>')
  })

  it('没设默认签名时不创建', () => {
    const planned = planFileManageLetters({
      customerName: '甲',
      mailStyle: 'merge_by_customer_description',
      files: [{ fileId, fileName: '甲.pdf', fileDescription: '专利证书', customerName: '甲' }],
      mappings: [mapping('专利证书', typeId)],
      descriptionNodes: testDescriptionNodes,
      subject,
      hasSender: true,
      hasReviewer: true,
      hasSignature: false
    })
    expect(planned.letters[0]?.blocked).toContain('默认签名')
  })

  it('默认发件人能从名称和尖括号里拆出来', () => {
    expect(senderAddress({ label: '林小樱<lin@example.com>' })).toEqual({ name: '林小樱', email: 'lin@example.com' })
    expect(senderAddress({ name: '林小樱', email: 'lin@example.com', label: '' })).toEqual({ name: '林小樱', email: 'lin@example.com' })
  })

  it('客户联系人和商务都写成名称加邮箱，写不成的跳过', () => {
    expect(formatPeople([{ name: '魏丽琼', email: 'wei@example.com' }, { name: '', email: '' }])).toEqual({
      value: '魏丽琼(wei@example.com);',
      skipped: []
    })
    expect(formatPeople([
      { name: '魏丽琼(IPR)', email: 'wei@example.com' },
      { name: '林小樱', email: 'lin@example.com' }
    ])).toEqual({
      value: '林小樱(lin@example.com);',
      skipped: ['魏丽琼(IPR)']
    })
    expect(formatPeople([{ name: '魏丽琼(IPR)', email: 'wei@example.com' }])).toEqual({
      value: '',
      skipped: ['魏丽琼(IPR)']
    })
  })

  it('某一封联系人写不成地址时，不拦住后面勾选的', () => {
    expect(fileManageSubmitShouldHalt('没有提交到审核人。客户联系人「魏丽琼(IPR)」的姓名或邮箱不能写成「名称(邮箱);」，没有提交。')).toBe(false)
    expect(fileManageSubmitShouldHalt('没有提交到审核人。这封还在审核里，没有再创建。')).toBe(false)
    expect(fileManageSubmitShouldHalt('没有提交到审核人。提交响应无法确认，没有再次提交。')).toBe(true)
    expect(fileManageSubmitShouldHalt('没有提交到审核人。EASY 网关异常。 EASY 网关异常。')).toBe(false)
    expect(fileManageSubmitShouldHalt('没有提交到审核人。请求超时，请重试。')).toBe(false)
  })

  it('审核人必须是下一节点里的默认审核人', () => {
    const node = { reviewers: [{ id: typeId, name: '林小樱' }], reviewerFormat: 'structured' } as WorkflowNode
    expect(matchConfiguredReviewer(typeId, node)).toEqual({ ok: true, id: typeId, name: '林小樱' })
    expect(matchConfiguredReviewer(fileId, node).ok).toBe(false)
  })

  it('记过已提交的先去读那封的流程，没确认的停住', () => {
    const item = {
      fileId,
      fileIds: [fileId],
      fileNames: ['甲.pdf'],
      mailTypeId: typeId,
      mailStyle: '1' as const,
      subject: '标题',
      senderId: typeId,
      senderName: '林',
      senderEmail: 'lin@example.com',
      reviewerId: fileId,
      reviewerName: '审',
      signature: '此致'
    }
    expect(isContentRequest({ type: MessageType.SubmitFileManage, payload: { userId: typeId, items: [{ ...item, mailStyle: '2' }] } })).toBe(true)
    expect(isContentRequest({ type: MessageType.SubmitFileManage, payload: { userId: typeId, items: [{ ...item, mailStyle: '3' }] } })).toBe(false)
    expect(isContentRequest({ type: MessageType.SubmitFileManage, payload: { userId: typeId, items: [{ ...item, addresses: { to: '追加(extra@example.com);', cc: { sender: false, sales: true } } }] } })).toBe(true)
    expect(isContentRequest({ type: MessageType.SubmitFileManage, payload: { userId: typeId, items: [{ ...item, addresses: { to: 'invalid-email' } }] } })).toBe(false)

    const recalled = nextFileManageAttempt(item, { fileId, mailId: otherType, state: 'submitted' })
    expect(recalled.action === 'send' && recalled.item.recall && recalled.item.mailId).toBe(otherType)
    expect(nextFileManageAttempt(item, { fileId, mailId: '', state: 'submitted' }).action).toBe('send')
    expect(nextFileManageAttempt(item, { fileId, mailId: '', state: 'unknown' }).action).toBe('stop')
    const again = nextFileManageAttempt(item, { fileId, mailId: otherType, state: 'created' })
    expect(again.action === 'send' && again.item.mailId).toBe(otherType)
    expect(classifyMailFlow('END', 'node')).toBe('done')
    expect(classifyMailFlow('CHECK', 'node')).toBe('pending')
    expect(classifyMailFlow(null, null)).toBe('open')
  })
})
