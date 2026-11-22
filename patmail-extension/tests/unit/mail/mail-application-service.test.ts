import { describe, expect, it, vi } from 'vitest'
import { extractTargetVolumes, MailApplicationService } from '../../../src/application/mail/mail-service'
import type { EasyMailGateway } from '../../../src/application/mail/ports/easy-mail-gateway'
import type { CustomerQueryProfile } from '../../../src/customer/types'
import type { MailRuleBundle } from '../../../src/mail/types'

const VALID_REVIEWER_GUID = '11111111-1111-4111-8111-111111111111'
const VALID_OPERATOR_GUID = '22222222-2222-4222-8222-222222222222'
const VALID_PROC_GUID = '33333333-3333-4333-8333-333333333333'
const VALID_CASE_GUID = '44444444-4444-4444-8444-444444444444'
const VALID_MAIL_TYPE_GUID = '55555555-5555-4555-8555-555555555555'

function makeRules(defaultReviewerId = VALID_REVIEWER_GUID): MailRuleBundle {
  return {
    version: 1,
    revision: 1,
    ownerId: VALID_OPERATOR_GUID,
    policies: [],
    mappings: [],
    recipients: [],
    signatures: [],
    subject: {
      template: '{caseVolume}-{fileDescription}',
      countInjection: false,
      anchor: '',
      missingAnchor: 'keep',
      version: 1,
    },
    body: { template: '您好', supplement: '', version: 1 },
    defaultReviewer: defaultReviewerId ? { userId: defaultReviewerId, name: '默认审核人甲' } : null,
    defaultSender: null,
  }
}

function makeCustomer(overrides: Partial<CustomerQueryProfile> = {}): CustomerQueryProfile {
  return {
    id: 'cust-1',
    name: '测试科技有限公司',
    baseTemplateId: 'tpl-1',
    overrides: {},
    workflowId: 'pct-reminder',
    limitMailStyle: '1',
    enabled: true,
    createdAt: '2026-11-22T00:00:00Z',
    updatedAt: '2026-11-22T00:00:00Z',
    pctTask: {
      workflowId: 'pct-reminder',
      ctrlProcId: 'ctrl-1',
      confirmedProcIds: [],
      createdAt: '2026-11-22T00:00:00Z',
      rows: [
        {
          ourVolume: 'PA2511001PCT',
          customerVolume: 'CL-001',
          customerName: '测试科技有限公司',
          contactName: '张三',
          iprName: '李四',
          procLabel: 'PCT国际阶段',
          mailTypeLabel: 'PCT提醒',
          mailTypeId: VALID_MAIL_TYPE_GUID,
        },
      ],
    },
    ...overrides,
  }
}

describe('MailApplicationService', () => {
  const service = new MailApplicationService()

  it('extracts deduplicated target volumes from raw text or file bucket', () => {
    expect(extractTargetVolumes('P001, P002；P001\nP003', [])).toEqual(['P001', 'P002', 'P003'])
    expect(
      extractTargetVolumes('', [
        { fileId: 'f1', fileName: 'a.pdf', fileDescription: '', customerName: '', caseVolume: 'PA01' },
        {
          fileId: 'f2',
          fileName: 'b.pdf',
          fileDescription: '',
          customerName: '',
          customerVolume: 'CL02',
          caseVolume: 'PA02',
        },
      ]),
    ).toEqual(['PA01', 'CL02'])
  })

  it('drafts mail via domain rules or returns readable guidance on empty/missing match', () => {
    expect(
      service.draftMail({
        operatorId: VALID_OPERATOR_GUID,
        files: [],
        customerName: '',
        account: { customers: [], rules: null },
      }),
    ).toEqual({ ok: false, message: '先查案件，这一轮还没有文件可以起草。' })

    const drafted = service.draftMail({
      operatorId: VALID_OPERATOR_GUID,
      files: [
        {
          fileId: 'f1',
          fileName: '受理通知书.pdf',
          fileDescription: '受理通知书',
          customerName: '测试科技有限公司',
          caseVolume: 'PA2511001PCT',
        },
      ],
      customerName: '测试科技',
      account: { customers: [makeCustomer()], rules: makeRules() },
    })
    expect(drafted.ok).toBe(true)
    if (drafted.ok) {
      expect(drafted.letters).toBe(1)
      expect(drafted.who).toContain('收件：')
    }
  })

  it('checks flow reviewers without triggering submission', async () => {
    const submitSpy = vi.fn<EasyMailGateway['submitLimitMail']>()
    const gateway: EasyMailGateway = {
      listReviewers: vi.fn(() =>
        Promise.resolve({
          ok: true as const,
          reviewers: [{ id: VALID_OPERATOR_GUID, name: '当前操作人' }],
        }),
      ),
      readCaseFlow: vi.fn(),
      submitLimitMail: submitSpy,
    }
    const summary = await service.checkReviewers({
      operatorId: VALID_OPERATOR_GUID,
      gateway,
    })
    expect(summary).toContain('审核人共 1 人')
    expect(summary).toContain('当前登录人在名单里')
    expect(summary).toContain('这一步没有提交审核')
    expect(submitSpy).not.toHaveBeenCalled()
  })

  it('enforces write switch, configured defaultReviewer, CaseBusFlow gate, and unknown non-retry', async () => {
    const noopSubmitSpy = vi.fn<EasyMailGateway['submitLimitMail']>()
    const noopGateway: EasyMailGateway = {
      listReviewers: vi.fn(),
      readCaseFlow: vi.fn(() => Promise.resolve({ ok: true as const, gate: 'pending' as const })),
      submitLimitMail: noopSubmitSpy,
    }
    const closed = await service.submitLimitMailForReview({
      operatorId: VALID_OPERATOR_GUID,
      writeSwitchOpen: false,
      files: [],
      deadlines: [{ procId: VALID_PROC_GUID, caseId: VALID_CASE_GUID, caseVolume: 'PA2511001PCT' }],
      caseVolume: '',
      account: { customers: [makeCustomer()], rules: makeRules() },
      gateway: noopGateway,
    })
    expect(closed).toEqual({ ok: false, status: 'blocked', message: '写开关已关闭，没有提交到 EASY。' })

    const missingReviewer = await service.submitLimitMailForReview({
      operatorId: VALID_OPERATOR_GUID,
      writeSwitchOpen: true,
      files: [],
      deadlines: [{ procId: VALID_PROC_GUID, caseId: VALID_CASE_GUID, caseVolume: 'PA2511001PCT' }],
      caseVolume: '',
      account: { customers: [makeCustomer()], rules: makeRules('') },
      gateway: noopGateway,
    })
    expect(missingReviewer).toEqual({
      ok: false,
      status: 'blocked',
      message: '还没有默认审核人。请到发文映射里设置。',
    })

    const heldOutcome = await service.submitLimitMailForReview({
      operatorId: VALID_OPERATOR_GUID,
      writeSwitchOpen: true,
      files: [],
      deadlines: [{ procId: VALID_PROC_GUID, caseId: VALID_CASE_GUID, caseVolume: 'PA2511001PCT' }],
      caseVolume: '',
      account: { customers: [makeCustomer()], rules: makeRules() },
      gateway: noopGateway,
    })
    expect(heldOutcome.status).toBe('held')
    expect(heldOutcome.message).toContain('这些事项还在审核里')
    expect(noopSubmitSpy).not.toHaveBeenCalled()

    let submittedItems: Array<{ reviewerId?: string }> = []
    const okSubmitSpy = vi.fn<EasyMailGateway['submitLimitMail']>(request => {
      submittedItems = request.items
      return Promise.resolve({
        status: 'ok' as const,
        stopped: false,
        results: [{ procId: VALID_PROC_GUID, mailId: 'mail-1', state: 'submitted' as const, message: 'ok' }],
      })
    })
    const okGateway: EasyMailGateway = {
      listReviewers: vi.fn(),
      readCaseFlow: vi.fn(() => Promise.resolve({ ok: true as const, gate: 'open' as const })),
      submitLimitMail: okSubmitSpy,
    }
    const okOutcome = await service.submitLimitMailForReview({
      operatorId: VALID_OPERATOR_GUID,
      writeSwitchOpen: true,
      files: [],
      deadlines: [{ procId: VALID_PROC_GUID, caseId: VALID_CASE_GUID, caseVolume: 'PA2511001PCT' }],
      caseVolume: 'PA2511001PCT',
      account: { customers: [makeCustomer()], rules: makeRules() },
      gateway: okGateway,
    })
    expect(okOutcome.ok).toBe(true)
    expect(okOutcome.status).toBe('submitted')
    expect(okOutcome.message).toContain('已提交到 EASY')
    expect(okOutcome.message).toContain('默认审核人')
    expect(submittedItems[0]?.reviewerId).toBe(VALID_REVIEWER_GUID)

    const unknownSubmitSpy = vi.fn<EasyMailGateway['submitLimitMail']>(() =>
      Promise.resolve({ status: 'unknown' as const, message: '提交没有返回。' }),
    )
    const unknownGateway: EasyMailGateway = {
      listReviewers: vi.fn(),
      readCaseFlow: vi.fn(() => Promise.resolve({ ok: true as const, gate: 'open' as const })),
      submitLimitMail: unknownSubmitSpy,
    }
    const unknownOutcome = await service.submitLimitMailForReview({
      operatorId: VALID_OPERATOR_GUID,
      writeSwitchOpen: true,
      files: [],
      deadlines: [{ procId: VALID_PROC_GUID, caseId: VALID_CASE_GUID, caseVolume: 'PA2511001PCT' }],
      caseVolume: 'PA2511001PCT',
      account: { customers: [makeCustomer()], rules: makeRules() },
      gateway: unknownGateway,
    })
    expect(unknownOutcome).toEqual({
      ok: false,
      status: 'unknown',
      message: '提交结果未确认，请先在 EASY 核对。提交没有返回。',
    })
    expect(unknownSubmitSpy).toHaveBeenCalledTimes(1)

    const secondProcId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const mixedSubmitSpy = vi.fn<EasyMailGateway['submitLimitMail']>(() =>
      Promise.resolve({
        status: 'ok',
        stopped: false,
        results: [
          { procId: VALID_PROC_GUID, mailId: 'mail-1', state: 'submitted', message: 'ok' },
          { procId: secondProcId, mailId: '', state: 'unknown', message: '回执断开' },
        ],
      }),
    )
    const mixed = await service.submitLimitMailForReview({
      operatorId: VALID_OPERATOR_GUID,
      writeSwitchOpen: true,
      files: [],
      deadlines: [
        { procId: VALID_PROC_GUID, caseId: VALID_CASE_GUID, caseVolume: 'PA2511001PCT' },
        { procId: secondProcId, caseId: VALID_CASE_GUID, caseVolume: 'PA2511001PCT' },
      ],
      caseVolume: 'PA2511001PCT',
      account: { customers: [makeCustomer()], rules: makeRules() },
      gateway: { ...okGateway, submitLimitMail: mixedSubmitSpy },
    })
    expect(mixed).toMatchObject({ ok: false, status: 'unknown' })
    expect(mixed.message).toContain('已提交 1 件')
    expect(mixed.message).toContain('另有 1 件提交结果未确认')
    expect(mixedSubmitSpy).toHaveBeenCalledTimes(1)

    let loaded = false
    const noMatchOutcome = await service.submitLimitMailForReview({
      operatorId: VALID_OPERATOR_GUID,
      writeSwitchOpen: true,
      files: [],
      deadlines: [{ procId: VALID_PROC_GUID, caseId: VALID_CASE_GUID, caseVolume: 'PA2511001PCT' }],
      caseVolume: 'OTHER999',
      account: () => {
        loaded = true
        return Promise.resolve({ customers: [makeCustomer()], rules: makeRules() })
      },
      gateway: noopGateway,
    })
    expect(noMatchOutcome).toEqual({
      ok: false,
      status: 'blocked',
      message: '这一轮期限结果里没有这些文号。先按文号查期限。',
    })
    expect(loaded).toBe(false)
  })

  it('shares domain filling, recipient merging, and defaultReviewer rules across UI and Agent previews', () => {
    const baseRules = makeRules()
    const rulesWithRecipient: MailRuleBundle = {
      ...baseRules,
      policies: [
        {
          customerProfileId: 'cust-1',
          sendMode: 'merge_by_customer_description',
          enabled: true,
          version: 1,
          updatedAt: '2026-11-22T00:00:00Z',
        },
      ],
      mappings: [
        {
          id: 'map-1',
          fileDescriptionText: '受理通知书',
          mailTypeId: VALID_MAIL_TYPE_GUID,
          mailTypeName: '新申请受理',
          enabled: true,
          version: 1,
          updatedAt: '2026-11-22T00:00:00Z',
        },
      ],
      recipients: [
        {
          id: 'rec-1',
          customerProfileId: 'cust-1',
          name: '默认收件人',
          to: ['client@example.com'],
          cc: ['cc@example.com'],
          enabled: true,
          isDefault: true,
          version: 1,
          updatedAt: '2026-11-22T00:00:00Z',
        },
      ],
    }
    const customer = makeCustomer({
      pctTask: {
        workflowId: 'pct-reminder',
        ctrlProcId: 'ctrl-1',
        confirmedProcIds: [],
        createdAt: '2026-11-22T00:00:00Z',
        rows: [
          {
            ourVolume: 'PA2511001PCT',
            customerVolume: 'CL-001',
            customerName: '测试科技有限公司',
            contactName: '张三',
            iprName: '李四',
            procLabel: '受理通知书',
            mailTypeLabel: '新申请受理',
            mailTypeId: VALID_MAIL_TYPE_GUID,
            mailTo: 'override@example.com',
          },
        ],
      },
    })
    const file = {
      fileId: '33333333-3333-4333-8333-333333333331',
      fileName: '受理通知书.pdf',
      fileDescription: '受理通知书',
      customerName: '测试科技有限公司',
      caseVolume: 'PA2511001PCT',
    }

    const agentDraft = service.draftMail({
      operatorId: VALID_OPERATOR_GUID,
      files: [file],
      customerName: '测试科技有限公司',
      account: { customers: [customer], rules: rulesWithRecipient },
    })
    const uiDraft = service.applyRulesToDraft({
      customer,
      files: [file],
      rules: rulesWithRecipient,
      operatorId: VALID_OPERATOR_GUID,
      signatureText: '顺颂商祺',
    })

    expect(agentDraft.ok).toBe(true)
    if (agentDraft.ok) {
      expect(uiDraft.subject).toBe(agentDraft.subject)
    }
    expect(uiDraft.to).toContain('override@example.com')
    expect(uiDraft.to).toContain('client@example.com')
    expect(uiDraft.body).toContain('顺颂商祺')

    const assembled = service.previewAssembledMail({
      customer,
      mailTypeId: uiDraft.mailTypeId,
      mailTypeName: uiDraft.mailTypeName,
      files: [file],
      to: uiDraft.to,
      cc: uiDraft.cc,
      subject: uiDraft.subject,
      body: uiDraft.body,
      rules: rulesWithRecipient,
      sender: { mailsetId: 'ms-1', label: '主发件箱' },
    })
    expect(assembled.reviewerId).toBe(VALID_REVIEWER_GUID)
    expect(assembled.reviewerName).toBe('默认审核人甲')
    expect(assembled.gaps).toEqual([])

    const wfMissingSender = service.previewWorkflowRows({
      rows: customer.pctTask!.rows,
      customers: [customer],
      rules: rulesWithRecipient,
      operatorId: VALID_OPERATOR_GUID,
      signatureText: '顺颂商祺',
      specials: new Set<string>(),
      recipientMode: 'ipr',
      sender: null,
    })
    expect(wfMissingSender.ok).toBe(false)
    expect(wfMissingSender.status).toContain('还没有发件人')

    const wfNameOnly = service.previewWorkflowRows({
      rows: [{ ...customer.pctTask!.rows[0], mailTo: '' }],
      customers: [customer],
      rules: { ...rulesWithRecipient, recipients: [] },
      operatorId: VALID_OPERATOR_GUID,
      signatureText: '顺颂商祺',
      specials: new Set<string>(),
      recipientMode: 'ipr',
      sender: { mailsetId: 'ms-1', label: '主发件箱' },
    })
    expect(wfNameOnly.ok).toBe(true)
    expect(wfNameOnly.batchPolicy).toBe('per_row')
    expect(wfNameOnly.items[0]?.mail.reviewerId).toBe(VALID_REVIEWER_GUID)
    expect(wfNameOnly.items[0]?.mail.gaps).toContain('收件人还是表格里的称呼。')

    const blockedDraft = service.planSelectionDrafts({
      files: [{ ...file, customerProfileId: 'cust-1' }],
      rules: rulesWithRecipient,
      customers: [customer],
      operatorId: VALID_OPERATOR_GUID,
      origin: 'https://easy.example.test',
    })
    expect(blockedDraft).toHaveLength(1)
    expect(blockedDraft[0]?.status).toBe('blocked')

    const planned = service.planSelectionDrafts({
      files: [
        {
          ...file,
          customerProfileId: 'cust-1',
          customerBinding: {
            confirmed: true,
            profileId: 'cust-1',
            profileName: '测试科技有限公司',
            sourceCustomerName: '测试科技有限公司',
            source: 'explicit',
          },
        },
      ],
      rules: rulesWithRecipient,
      customers: [customer],
      operatorId: VALID_OPERATOR_GUID,
      origin: 'https://easy.example.test',
    })
    expect(planned).toHaveLength(1)
    expect(planned[0]?.mailTypeId).toBe(VALID_MAIL_TYPE_GUID)
  })
})
