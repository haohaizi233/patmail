import { sheetRecipientNames } from '../../customer/pct-recipients'
import { limitMailItems, summarizeLimitMailSubmit } from '../../customer/limit-mail-submit'
import type { PctTaskRow } from '../../customer/types'
import { groupWorkflowRows } from '../../customer/workflow-mail'
import { fillFromRules } from '../../mail/assemble'
import type { SelectedPatentFile } from '../../mail/types'
import { isQueryGuid } from '../../query/query-validator'
import { isRecord } from '../../shared/guards'
import { isMessage, MessageType } from '../../shared/message'
import { resolveReviewer } from '../../workflow/reviewer-resolver'
import type { WorkflowNode } from '../../workflow/types'
import type {
  CheckReviewersCommand,
  DraftMailCommand,
  DraftMailResult,
  SubmitLimitMailCommand,
  SubmitLimitMailOutcome,
} from './mail-contracts'

function forwardErrorText(value: unknown): string | null {
  if (isRecord(value) && typeof value.error === 'string') return value.error
  if (!isMessage(value)) return 'EASY 没有返回可识别的结果。'
  return null
}

export function extractTargetVolumes(raw: string, bucket: readonly SelectedPatentFile[]): string[] {
  const typed = raw
    .split(/[\s,，;；]+/)
    .map(item => item.trim())
    .filter(Boolean)
  const fromFiles = bucket.map(file => file.customerVolume || file.caseVolume || '').filter(Boolean)
  return [...new Set(typed.length > 0 ? typed : fromFiles)].slice(0, 20)
}

export class MailApplicationService {
  draftMail(command: DraftMailCommand): DraftMailResult {
    const bucket = command.files
    if (bucket.length === 0) {
      return { ok: false, message: '先查案件，这一轮还没有文件可以起草。' }
    }
    const named = command.customerName.trim()
    const usable = named ? bucket.filter(file => file.customerName.includes(named)) : bucket
    const files = usable.length > 0 ? usable : bucket
    const label = named || files[0]?.customerName || ''
    const customer = command.account.customers.find(
      item => item.name === label || (label && item.name.includes(label)),
    )
    if (!customer) {
      return { ok: false, message: `插件里没有对上客户「${label || '未命名'}」。` }
    }
    const filled = fillFromRules(customer, files, command.account.rules, command.operatorId)
    const rows: PctTaskRow[] = files.map(file => ({
      ourVolume: file.caseVolume ?? '',
      customerVolume: file.customerVolume ?? '',
      customerName: file.customerName || customer.name,
      contactName: '',
      iprName: '',
      procLabel: '',
      mailTypeLabel: filled.mailTypeName,
    }))
    const groups = groupWorkflowRows(customer.limitMailStyle ?? '1', rows)
    const whoLines = groups
      .flatMap((group, index) => {
        const row = group[0]
        if (!row) return []
        const names = sheetRecipientNames(row)
        return [`第 ${index + 1} 封：收件 ${names.to || '未定'}，抄送 ${names.cc || '商务'}`]
      })
      .join('\n')
    const who = [`收件：${filled.to || '还没有收件人规则'}`, whoLines].filter(Boolean).join('\n')
    return {
      ok: true,
      letters: groups.length,
      subject: filled.subject,
      body: filled.body,
      notes: filled.notes,
      who,
    }
  }

  async checkReviewers(command: CheckReviewersCommand): Promise<string> {
    const found = await command.forward({ type: MessageType.ListFlowReviewers })
    const error = forwardErrorText(found)
    if (error) return error
    if (!isMessage(found) || found.type !== MessageType.ListFlowReviewersResult) {
      return '审核人没有返回。'
    }
    if (!found.payload.ok) return found.payload.error.message
    const reviewers = found.payload.data.reviewers
    const node: WorkflowNode = {
      listId: 'account',
      seq: 1,
      next: '',
      nodeId: 'account',
      nodeCode: '',
      nodeName: '审核',
      allowSkip: false,
      userType: '',
      parallel: false,
      needAllAudit: false,
      reviewers,
      reviewerFormat:
        reviewers.length > 0 && reviewers.every(item => isQueryGuid(item.id)) ? 'structured' : 'unknown',
    }
    const decided = resolveReviewer(command.operatorId, node)
    const verdict = decided.status === 'matched' ? '当前登录人在名单里。' : decided.reason
    const names = reviewers
      .slice(0, 20)
      .map(item => item.name)
      .join('、')
    return `审核人共 ${reviewers.length} 人。${verdict}这一步没有提交审核。\n${names}`.trim()
  }

  async submitLimitMailForReview(command: SubmitLimitMailCommand): Promise<SubmitLimitMailOutcome> {
    if (!command.writeSwitchOpen) {
      return { ok: false, status: 'blocked', message: '写开关已关闭，没有提交到 EASY。' }
    }
    if (command.deadlines.length === 0) {
      return { ok: false, status: 'blocked', message: '先查期限，这一轮还没有可提交的事项。' }
    }
    const named = extractTargetVolumes(command.caseVolume, command.files)
    const picked = named.length
      ? command.deadlines.filter(row =>
          named.some(volume => row.caseVolume.trim().toLowerCase() === volume.trim().toLowerCase()),
        )
      : command.deadlines
    if (picked.length === 0) {
      return { ok: false, status: 'blocked', message: '这一轮期限结果里没有这些文号。先按文号查期限。' }
    }

    const account = typeof command.account === 'function' ? await command.account() : command.account

    // 默认审核人始终读取发文规则中的 defaultReviewer（不改为当前操作登录人）。
    const reviewerId = account.rules?.defaultReviewer?.userId ?? ''
    if (!isQueryGuid(reviewerId)) {
      return { ok: false, status: 'blocked', message: '还没有默认审核人。请到发文映射里设置。' }
    }

    const sheets = account.customers.flatMap(profile => profile.pctTask?.rows ?? [])
    const openIds: string[] = []
    const held: string[] = []
    for (const row of picked) {
      if (!isQueryGuid(row.procId) || !isQueryGuid(row.caseId)) {
        held.push(row.caseVolume || row.procId)
        continue
      }
      const gate = await command.forward({
        type: MessageType.ReadCaseBusFlow,
        payload: { caseId: row.caseId, procId: row.procId },
      })
      const state =
        isMessage(gate) && gate.type === MessageType.CaseBusFlowResult && gate.payload.ok
          ? gate.payload.data.gate
          : 'pending'
      if (state === 'open' || state === 'done') openIds.push(row.procId)
      else held.push(row.caseVolume || row.procId)
    }

    if (openIds.length === 0) {
      return {
        ok: false,
        status: 'held',
        message: `这些事项还在审核里，没有再创建。${held.filter(Boolean).join('、')}`.trim(),
      }
    }

    const lead = picked.every(row => {
      const sheet = sheets.find(
        item => item.ourVolume.trim().toLowerCase() === row.caseVolume.trim().toLowerCase(),
      )
      const owner = account.customers.find(profile =>
        profile.pctTask?.rows.some(
          item => item.ourVolume === sheet?.ourVolume && item.customerName === sheet?.customerName,
        ),
      )
      return owner?.pctTask?.recipientMode === 'lead'
    })

    const senderId = account.rules?.defaultSender?.mailsetId ?? ''
    const planned = limitMailItems({
      reviewerId,
      procIds: openIds,
      rows: picked.map(row => ({ procId: row.procId, caseVolume: row.caseVolume, ctrlProc: row.ctrlProc })),
      sheetRows: sheets,
      mode: lead ? 'lead' : 'ipr',
      address: 'auto',
      ...(isQueryGuid(senderId) ? { senderId } : {}),
    })
    if (!planned.ok) {
      return { ok: false, status: 'rejected', message: planned.message }
    }

    const found = await command.forward({
      type: MessageType.SubmitLimitMail,
      payload: { userId: command.operatorId, items: planned.items },
    })
    const error = forwardErrorText(found)
    if (error) {
      return { ok: false, status: 'failed', message: error }
    }
    if (!isMessage(found) || found.type !== MessageType.SubmitLimitMailResult) {
      return { ok: false, status: 'failed', message: '提交没有返回。' }
    }

    const summary = summarizeLimitMailSubmit(found.payload.results, found.payload.stopped)
    if (!summary.startsWith('已提交')) {
      return { ok: false, status: 'rejected', message: summary }
    }
    return { ok: true, status: 'submitted', message: `已提交到 EASY。${summary}` }
  }
}
