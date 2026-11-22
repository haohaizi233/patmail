import {
  arbitratedMark as formatArbitratedMark,
  carriedMark as formatCarriedMark,
  sheetDisplayName as formatSheetDisplayName,
  sheetRecipientNames,
  usesInventorSheet as matchesInventorSheet,
  type PctRecipientMode,
} from '../../customer/pct-recipients'
import { limitMailItems, summarizeLimitMailSubmit } from '../../customer/limit-mail-submit'
import type { CustomerQueryProfile, PctTaskRow } from '../../customer/types'
import { groupWorkflowRows } from '../../customer/workflow-mail'
import { assembleMail, fillFromRules, type AssembledMail } from '../../mail/assemble'
import { appendRecipientField } from '../../mail/easy/contracts'
import { selectionFingerprint } from '../../mail/fingerprint'
import { planDrafts } from '../../mail/planner'
import type { MailDraftPreview, SelectedPatentFile } from '../../mail/types'
import { isQueryGuid } from '../../query/query-validator'
import { resolveReviewer } from '../../workflow/reviewer-resolver'
import type { WorkflowNode } from '../../workflow/types'
import type {
  ApplyRulesToDraftCommand,
  ApplyRulesToDraftResult,
  CheckReviewersCommand,
  DraftMailCommand,
  DraftMailResult,
  PlanSelectionDraftsCommand,
  PreviewAssembledMailCommand,
  PreviewWorkflowRowsCommand,
  PreviewWorkflowRowsResult,
  SubmitLimitMailCommand,
  SubmitLimitMailOutcome,
} from './mail-contracts'

export function extractTargetVolumes(raw: string, bucket: readonly SelectedPatentFile[]): string[] {
  const typed = raw
    .split(/[\s,，;；]+/)
    .map(item => item.trim())
    .filter(Boolean)
  const fromFiles = bucket.map(file => file.customerVolume || file.caseVolume || '').filter(Boolean)
  return [...new Set(typed.length > 0 ? typed : fromFiles)].slice(0, 20)
}

export function sheetDisplayName(raw: string): string {
  return formatSheetDisplayName(raw)
}

export function usesInventorSheet(customerName: string, specials: ReadonlySet<string>): boolean {
  return matchesInventorSheet(customerName, specials)
}

export function carriedMark(name: string, carried: boolean | undefined): string {
  return formatCarriedMark(name, carried)
}

export function arbitratedMark(name: string, arbitrated: boolean | undefined): string {
  return formatArbitratedMark(name, arbitrated)
}

function workflowRowAddresses(
  group: readonly PctTaskRow[],
  field: 'to' | 'cc',
  specials: ReadonlySet<string>,
  recipientMode: PctRecipientMode,
): string {
  return [
    ...new Set(
      group
        .map(row => {
          const resolved = sheetRecipientNames(row, specials, recipientMode)
          return (field === 'to' ? row.mailTo || resolved.to : row.mailCc || resolved.cc).trim()
        })
        .filter(Boolean),
    ),
  ].join(';')
}

function workflowCustomerProfile(customers: readonly CustomerQueryProfile[], name: string): CustomerQueryProfile {
  const saved = customers.find(item => item.enabled !== false && item.name.trim() === name.trim())
  if (saved) return saved
  const now = new Date().toISOString()
  return {
    id: 'sheet',
    name: name.trim() || '表格里的客户',
    baseTemplateId: 'sheet',
    overrides: {},
    enabled: true,
    createdAt: now,
    updatedAt: now,
  }
}

export class MailApplicationService {
  /** 纯预览：根据客户规则与签名模板填充草稿字段（含孤立 PCT 行预设收件人），不产生写操作。 */
  applyRulesToDraft(command: ApplyRulesToDraftCommand): ApplyRulesToDraftResult {
    const filled = fillFromRules(
      command.customer,
      command.files,
      command.rules,
      command.operatorId,
      command.signatureText,
    )
    const sole = command.customer.pctTask?.rows.length === 1 ? command.customer.pctTask.rows[0] : null
    const keptTo = sole?.mailTo || (command.customer.pctTask?.rows.length === 1 ? command.customer.pctTask.mailTo : '')
    const keptCc = sole?.mailCc || (command.customer.pctTask?.rows.length === 1 ? command.customer.pctTask.mailCc : '')
    return {
      ...filled,
      to: keptTo ? appendRecipientField(keptTo, filled.to) : filled.to,
      cc: keptCc ? appendRecipientField(keptCc, filled.cc) : filled.cc,
    }
  }

  /** 纯预览：组装一封待核对的邮件预览，审核人统一取配置中的默认审核人。 */
  previewAssembledMail(command: PreviewAssembledMailCommand): AssembledMail {
    return assembleMail({
      customer: command.customer,
      mailTypeId: command.mailTypeId,
      mailTypeName: command.mailTypeName,
      files: command.files,
      reviewer: command.reviewer !== undefined ? command.reviewer : (command.rules?.defaultReviewer ?? null),
      sender: command.sender ?? null,
      to: command.to,
      cc: command.cc,
      subject: command.subject,
      body: command.body,
    })
  }

  /** 纯预览：按显式工作流批次策略逐件组装 PCT 工作流预览卡片，与 Agent/UI 共用填表、收件人与默认审核人规则。 */
  previewWorkflowRows(command: PreviewWorkflowRowsCommand): PreviewWorkflowRowsResult {
    const batchPolicy = command.batchPolicy ?? 'per_row'
    const unmatched = command.rows.filter(row => !row.mailTypeId)
    const missing: string[] = []
    if (!command.rows.length) missing.push('先传入表格。')
    if (unmatched.length) missing.push('还有行没有对上发文类型，请在表格里点选。')
    if (!command.sender) missing.push('还没有发件人，请选一个。')
    if (missing.length || !command.sender) {
      return { ok: false, status: missing.join(''), batchPolicy, items: [] }
    }

    const sender = command.sender
    const reviewer = command.rules?.defaultReviewer ?? null
    const items = command.rows.map(row => {
      const group = [row]
      const files: SelectedPatentFile[] = group.map(entry => ({
        fileId: entry.ourVolume,
        fileName: entry.ourVolume,
        fileDescription: entry.procLabel,
        customerName: entry.customerName,
        caseVolume: entry.ourVolume,
        customerVolume: entry.customerVolume,
      }))
      const current = workflowCustomerProfile(command.customers, row.customerName)
      const filled = fillFromRules(current, files, command.rules, command.operatorId, command.signatureText)
      const to = workflowRowAddresses(group, 'to', command.specials, command.recipientMode)
      const cc = workflowRowAddresses(group, 'cc', command.specials, command.recipientMode)
      const mail = assembleMail({
        customer: current,
        mailTypeId: row.mailTypeId ?? '',
        mailTypeName: row.mailTypeLabel ?? '',
        files,
        to: to || filled.to,
        cc: cc || filled.cc,
        subject: filled.subject,
        body: filled.body,
        reviewer,
        sender,
      })
      if ((to || filled.to) && !(to || filled.to).includes('@')) {
        mail.gaps.push('收件人还是表格里的称呼。')
      }
      return { row, mail }
    })

    return { ok: true, status: '', batchPolicy, items }
  }

  /** 纯预览：按选定文件快照与规则版本号计算指纹并生成本地发文批次草稿。 */
  planSelectionDrafts(command: PlanSelectionDraftsCommand): MailDraftPreview[] {
    const files = command.files.map(file => ({
      ...file,
      ...(file.customerBinding ? { customerBinding: { ...file.customerBinding } } : {}),
    }))
    const fingerprint =
      command.snapshot?.fingerprint ??
      selectionFingerprint({
        files,
        revision: command.rules.revision,
        userId: command.operatorId,
        origin: command.origin,
      })
    const snapshot = command.snapshot ?? {
      selectedAt: command.selectedAt ?? new Date().toISOString(),
      files,
      configVersion: command.rules.revision,
      userId: command.operatorId,
      origin: command.origin,
      fingerprint,
    }
    return planDrafts(snapshot, command.rules, command.customers, command.operatorId)
  }

  draftMail(command: DraftMailCommand): DraftMailResult {
    const bucket = command.files
    if (bucket.length === 0) {
      return { ok: false, message: '先查案件，这一轮还没有文件可以起草。' }
    }
    const named = command.customerName.trim()
    const usable = named ? bucket.filter(file => file.customerName.includes(named)) : bucket
    const files = usable.length > 0 ? usable : bucket
    const label = named || files[0]?.customerName || ''
    const customer = command.account.customers.find(item => item.name === label || (label && item.name.includes(label)))
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
    const listed = await command.gateway.listReviewers()
    if (!listed.ok) return listed.message
    const reviewers = listed.reviewers
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
      reviewerFormat: reviewers.length > 0 && reviewers.every(item => isQueryGuid(item.id)) ? 'structured' : 'unknown',
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
      const flow = await command.gateway.readCaseFlow({ caseId: row.caseId, procId: row.procId })
      if (flow.ok && (flow.gate === 'open' || flow.gate === 'done')) openIds.push(row.procId)
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
      const sheet = sheets.find(item => item.ourVolume.trim().toLowerCase() === row.caseVolume.trim().toLowerCase())
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

    const receipt = await command.gateway.submitLimitMail({
      operatorId: command.operatorId,
      items: planned.items,
    })
    if (receipt.status === 'unknown') {
      return { ok: false, status: 'unknown', message: `提交结果未确认，请先在 EASY 核对。${receipt.message}` }
    }
    if (receipt.status !== 'ok') {
      return { ok: false, status: receipt.status, message: receipt.message }
    }

    const summary = summarizeLimitMailSubmit(receipt.results, receipt.stopped)
    const confirmed = receipt.results.some(item => item.state === 'submitted')
    const unknownCount = receipt.results.filter(item => item.state === 'unknown').length
    if (unknownCount) {
      const prefix = confirmed ? `${summary}另有 ` : ''
      return { ok: false, status: 'unknown', message: `${prefix}${unknownCount} 件提交结果未确认，请先在 EASY 核对。` }
    }
    if (!confirmed) return { ok: false, status: 'rejected', message: summary }
    return { ok: true, status: 'submitted', message: `已提交到 EASY。${summary}` }
  }
}
