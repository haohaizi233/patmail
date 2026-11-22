import { describe, expect, it } from 'vitest'
import { extractTargetVolumes, MailApplicationService } from '../../../src/application/mail/mail-service'
import type { CustomerQueryProfile } from '../../../src/customer/types'
import type { MailRuleBundle } from '../../../src/mail/types'
import { MessageType } from '../../../src/shared/message'

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
    defaultReviewer: defaultReviewerId
      ? { userId: defaultReviewerId, name: '默认审核人甲' }
      : null,
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
    expect(
      extractTargetVolumes('P001, P002；P001\nP003', []),
    ).toEqual(['P001', 'P002', 'P003'])
    expect(
      extractTargetVolumes('', [
        { fileId: 'f1', fileName: 'a.pdf', fileDescription: '', customerName: '', caseVolume: 'PA01' },
        { fileId: 'f2', fileName: 'b.pdf', fileDescription: '', customerName: '', customerVolume: 'CL02', caseVolume: 'PA02' },
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
    const summary = await service.checkReviewers({
      operatorId: VALID_OPERATOR_GUID,
      forward: () =>
        Promise.resolve({
          type: MessageType.ListFlowReviewersResult,
          payload: {
            ok: true,
            data: {
              message: 'ok',
              reviewers: [{ id: VALID_OPERATOR_GUID, name: '当前操作人' }],
            },
          },
        }),
    })
    expect(summary).toContain('审核人共 1 人')
    expect(summary).toContain('当前登录人在名单里')
    expect(summary).toContain('这一步没有提交审核')
  })

  it('enforces write switch, configured defaultReviewer, and CaseBusFlow gate before submitting', async () => {
    const closed = await service.submitLimitMailForReview({
      operatorId: VALID_OPERATOR_GUID,
      writeSwitchOpen: false,
      files: [],
      deadlines: [{ procId: VALID_PROC_GUID, caseId: VALID_CASE_GUID, caseVolume: 'PA2511001PCT' }],
      caseVolume: '',
      account: { customers: [makeCustomer()], rules: makeRules() },
      forward: () => Promise.resolve({}),
    })
    expect(closed).toEqual({ ok: false, status: 'blocked', message: '写开关已关闭，没有提交到 EASY。' })

    const missingReviewer = await service.submitLimitMailForReview({
      operatorId: VALID_OPERATOR_GUID,
      writeSwitchOpen: true,
      files: [],
      deadlines: [{ procId: VALID_PROC_GUID, caseId: VALID_CASE_GUID, caseVolume: 'PA2511001PCT' }],
      caseVolume: '',
      account: { customers: [makeCustomer()], rules: makeRules('') },
      forward: () => Promise.resolve({}),
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
      forward: () =>
        Promise.resolve({
          type: MessageType.CaseBusFlowResult,
          payload: { ok: true, data: { gate: 'pending' } },
        }),
    })
    expect(heldOutcome.status).toBe('held')
    expect(heldOutcome.message).toContain('这些事项还在审核里')

    let submittedPayload: unknown = null
    const okOutcome = await service.submitLimitMailForReview({
      operatorId: VALID_OPERATOR_GUID,
      writeSwitchOpen: true,
      files: [],
      deadlines: [{ procId: VALID_PROC_GUID, caseId: VALID_CASE_GUID, caseVolume: 'PA2511001PCT' }],
      caseVolume: 'PA2511001PCT',
      account: { customers: [makeCustomer()], rules: makeRules() },
      forward: msg => {
        if (msg.type === MessageType.ReadCaseBusFlow) {
          return Promise.resolve({
            type: MessageType.CaseBusFlowResult,
            payload: { ok: true, data: { gate: 'open' } },
          })
        }
        submittedPayload = msg.payload
        return Promise.resolve({
          type: MessageType.SubmitLimitMailResult,
          payload: {
            stopped: false,
            results: [{ procId: VALID_PROC_GUID, mailId: 'mail-1', state: 'submitted', message: 'ok' }],
          },
        })
      },
    })
    expect(okOutcome.ok).toBe(true)
    expect(okOutcome.status).toBe('submitted')
    expect(okOutcome.message).toContain('已提交到 EASY')
    expect(okOutcome.message).toContain('默认审核人')
    expect((submittedPayload as { items: Array<{ reviewerId?: string }> }).items[0]?.reviewerId).toBe(
      VALID_REVIEWER_GUID,
    )
  })
})
