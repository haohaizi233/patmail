import type { PbcRates } from '../../billing/pbc-rates'
import { formatLocalDate, groupBillingRowsByCustomer, type BillingInput, type BillingTemplateId } from '../../billing/templates'
import type { BatchExportItemOutcome, BillingDeskSnapshot, ExportBillingCommand, ExportOutcome } from './billing-contracts'
import { cleanFeeRowForSnapshot, hasForeignCurrencyRows, validateBillingExportPreconditions } from './billing-validation'
import type { BillingRecoveryPort } from './ports/billing-recovery-port'
import type { BillingTemplatePort } from './ports/billing-template-port'
import type { DownloadPort } from './ports/download-port'
import type { ExchangeRatePort } from './ports/exchange-rate-port'
import type { SpreadsheetPort } from './ports/spreadsheet-port'

const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export interface BillingServicePorts {
  templates: BillingTemplatePort
  spreadsheet: SpreadsheetPort
  exchangeRates: ExchangeRatePort
  downloads: DownloadPort
  recovery: BillingRecoveryPort<BillingDeskSnapshot>
}

export class BillingApplicationService {
  private readonly ports: BillingServicePorts

  constructor(ports: BillingServicePorts) {
    this.ports = ports
  }

  fetchRates(): Promise<PbcRates> {
    return this.ports.exchangeRates.fetchRates()
  }

  loadDraft(scope: string): Promise<BillingDeskSnapshot | null> {
    return this.ports.recovery.load(scope)
  }

  saveDraft(scope: string, snapshot: BillingDeskSnapshot): Promise<void> {
    return this.ports.recovery.save(scope, snapshot)
  }

  async generateWorkbook(templateId: BillingTemplateId, input: BillingInput): Promise<ExportOutcome> {
    const rawBytes = await this.ports.templates.loadTemplate(templateId)
    const result = await this.ports.spreadsheet.fill(templateId, rawBytes, input)
    return {
      status: 'generated',
      bytes: result.bytes,
      fileName: result.fileName,
      blockCount: result.blockCount,
      warnings: result.warnings,
    }
  }

  async exportBilling(command: ExportBillingCommand): Promise<{ outcome: ExportOutcome; needsRateRefresh?: boolean }> {
    const validation = validateBillingExportPreconditions(command)
    if (!validation.ok) {
      return {
        outcome: { status: 'failed', reason: validation.reason },
        ...(validation.needsRateRefresh ? { needsRateRefresh: true } : {}),
      }
    }

    const today = command.today ?? new Date()
    const allowMixed = Boolean(command.parameters.allowMixedCustomers)
    const groups = groupBillingRowsByCustomer(command.rows)
    const rawBytes = await this.ports.templates.loadTemplate(command.templateId)

    const buildJobSpec = (input: BillingInput) => {
      if (!command.downloadScope) return {}
      const needsRates = hasForeignCurrencyRows(input.rows)
      const todayText = formatLocalDate(input.today)
      const canonicalBills = Object.fromEntries(
        Object.keys(input.bills)
          .sort((a, b) => a.localeCompare(b))
          .map(volume => [volume, input.bills[volume]]),
      )
      const canonicalParameters = JSON.stringify({
        template: command.templateId,
        input: {
          ...input,
          bills: canonicalBills,
          rates: needsRates
            ? Object.fromEntries(Object.entries(input.rates).sort(([a], [b]) => a.localeCompare(b)))
            : { CNY: 1 },
          rateSourceUrl: needsRates ? input.rateSourceUrl : '',
          rateDate: needsRates ? input.rateDate : todayText,
          today: todayText,
          rows: input.rows.map(row => {
            const { raw, ...rest } = cleanFeeRowForSnapshot(row)
            return {
              ...rest,
              raw: Object.fromEntries(Object.entries(raw).sort(([a], [b]) => a.localeCompare(b))),
            }
          }),
        },
      })
      const sortedRawRows = input.rows.map(({ raw, ...row }) => ({
        ...row,
        raw: Object.fromEntries(Object.entries(raw).sort(([a], [b]) => a.localeCompare(b))),
      }))
      const buildLegacyJson = (override: Partial<BillingInput> = {}) =>
        JSON.stringify({
          template: command.templateId,
          input: {
            ...input,
            ...override,
            today: todayText,
            rows: sortedRawRows,
          },
        })
      const legacyCandidates = [buildLegacyJson()]
      if (input.rateSourceUrl === '手工填写') {
        legacyCandidates.push(buildLegacyJson({ rateSourceUrl: '' }))
      }
      const legacyParameters = [...new Set(legacyCandidates)].filter(candidate => candidate !== canonicalParameters)
      return {
        job: {
          scope: command.downloadScope,
          parameters: canonicalParameters,
          ...(legacyParameters.length ? { legacyParameters } : {}),
          isStale: command.isStale,
        },
      }
    }

    if (!allowMixed && groups.length > 1) {
      const total = groups.length
      const concurrency = Math.max(1, Math.min(command.concurrency ?? 4, total))
      const downloadGapMs = Math.max(0, command.downloadGapMs ?? 120)
      const items = new Array<BatchExportItemOutcome>(total)

      type GeneratedSlot =
        | {
            ok: true
            input: BillingInput
            result: { bytes: Uint8Array; fileName: string; blockCount: number; warnings: string[] }
          }
        | { ok: false; outcome: BatchExportItemOutcome }

      interface DeferredSlot {
        promise: Promise<GeneratedSlot>
        resolve: (value: GeneratedSlot) => void
      }

      // 阶段 1（并发填表池）与阶段 2（有序串行下载派发）通过按索引对应的槽位队列接力。
      const readySlots: DeferredSlot[] = Array.from({ length: total }, () => {
        let resolve!: (value: GeneratedSlot) => void
        const promise = new Promise<GeneratedSlot>(res => {
          resolve = res
        })
        return { promise, resolve }
      })

      let cursor = 0
      let generatedDone = 0
      let downloadedDone = 0

      const staleOutcome = (
        customer: string,
        fileName = '',
        blockCount = 0,
        warnings: string[] = [],
      ): BatchExportItemOutcome => ({
        customer,
        status: 'failed',
        fileName,
        blockCount,
        warnings,
        reason: '生成期间请款范围或导出参数已变化，请核对后重新导出。',
      })

      const runGeneratorWorker = async (): Promise<void> => {
        while (cursor < total) {
          const index = cursor++
          const group = groups[index]
          if (command.isStale?.()) {
            readySlots[index].resolve({ ok: false, outcome: staleOutcome(group.customer) })
          } else {
            try {
              const input: BillingInput = {
                headers: command.parameters.headers,
                options: command.parameters.options,
                rates: command.parameters.rates,
                rateSourceUrl: command.parameters.rateSourceUrl,
                rateDate: command.parameters.rateDate,
                rows: group.rows,
                bills: command.bills,
                today,
                allowMixedCustomers: false,
                fileNameSuffix: group.customer,
              }
              const result = await this.ports.spreadsheet.fill(command.templateId, rawBytes, input)
              if (command.isStale?.()) {
                readySlots[index].resolve({
                  ok: false,
                  outcome: staleOutcome(group.customer, result.fileName, result.blockCount, result.warnings),
                })
              } else {
                readySlots[index].resolve({ ok: true, input, result })
              }
            } catch (error) {
              readySlots[index].resolve({
                ok: false,
                outcome: {
                  customer: group.customer,
                  status: 'failed',
                  fileName: '',
                  blockCount: 0,
                  warnings: [],
                  reason: error instanceof Error ? error.message : String(error),
                },
              })
            }
          }
          generatedDone += 1
          command.onProgress?.({
            done: downloadedDone,
            total,
            currentCustomer: group.customer,
            phase: 'generating',
            generatedDone,
            downloadedDone,
          })
        }
      }

      const runDownloadDispatcher = async (): Promise<void> => {
        for (let index = 0; index < total; index += 1) {
          const group = groups[index]
          const slot = await readySlots[index].promise
          if (!slot.ok) {
            items[index] = slot.outcome
          } else if (command.isStale?.()) {
            items[index] = staleOutcome(
              group.customer,
              slot.result.fileName,
              slot.result.blockCount,
              slot.result.warnings,
            )
          } else {
            try {
              const dl = await this.ports.downloads.download({
                bytes: slot.result.bytes,
                fileName: slot.result.fileName,
                mimeType: XLSX_MIME_TYPE,
                blockCount: slot.result.blockCount,
                warnings: slot.result.warnings,
                ...buildJobSpec(slot.input),
              })
              if (dl.status === 'download_completed' || dl.status === 'download_started' || dl.status === 'generated') {
                items[index] = {
                  customer: group.customer,
                  status: dl.status,
                  fileName: dl.fileName,
                  savedFileName: dl.status === 'download_completed' ? dl.savedFileName : undefined,
                  blockCount: dl.blockCount,
                  warnings: dl.warnings,
                }
              } else {
                items[index] = {
                  customer: group.customer,
                  status: dl.status === 'batch_completed' ? 'failed' : dl.status,
                  fileName: slot.result.fileName,
                  blockCount: slot.result.blockCount,
                  warnings: slot.result.warnings,
                  reason: dl.status === 'batch_completed' ? '批量导出嵌套异常。' : dl.reason,
                }
              }
            } catch (error) {
              items[index] = {
                customer: group.customer,
                status: 'failed',
                fileName: slot.result.fileName,
                blockCount: slot.result.blockCount,
                warnings: slot.result.warnings,
                reason: error instanceof Error ? error.message : String(error),
              }
            }
            if (index < total - 1 && downloadGapMs > 0 && !command.isStale?.()) {
              await new Promise<void>(resolve => setTimeout(resolve, downloadGapMs))
            }
          }
          downloadedDone += 1
          command.onProgress?.({
            done: downloadedDone,
            total,
            currentCustomer: group.customer,
            phase: 'downloading',
            generatedDone,
            downloadedDone,
          })
        }
      }

      await Promise.all([
        ...Array.from({ length: concurrency }, () => runGeneratorWorker()),
        runDownloadDispatcher(),
      ])
      const isOk = (item: BatchExportItemOutcome) =>
        item.status === 'download_completed' || item.status === 'download_started' || item.status === 'generated'
      const successCount = items.filter(isOk).length
      const failedCount = items.length - successCount
      const blockCount = items.reduce((sum, item) => sum + (isOk(item) ? item.blockCount : 0), 0)
      const warnings = items.flatMap(item =>
        item.warnings.map(warning => `【${item.customer}】${warning}`),
      )
      return {
        outcome: {
          status: 'batch_completed',
          totalCount: items.length,
          successCount,
          failedCount,
          blockCount,
          items,
          warnings,
        },
      }
    }

    const input: BillingInput = {
      headers: command.parameters.headers,
      options: command.parameters.options,
      rates: command.parameters.rates,
      rateSourceUrl: command.parameters.rateSourceUrl,
      rateDate: command.parameters.rateDate,
      rows: command.rows,
      bills: command.bills,
      today,
      ...(allowMixed ? { allowMixedCustomers: true } : {}),
      ...(allowMixed && groups.length > 1 ? { fileNameSuffix: `多客户合并(${groups.length}个)` } : {}),
    }

    const result = await this.ports.spreadsheet.fill(command.templateId, rawBytes, input)

    if (command.isStale?.()) {
      return {
        outcome: {
          status: 'failed',
          reason: '生成期间请款范围或导出参数已变化，请核对后重新导出。',
        },
      }
    }

    const downloadOutcome = await this.ports.downloads.download({
      bytes: result.bytes,
      fileName: result.fileName,
      mimeType: XLSX_MIME_TYPE,
      blockCount: result.blockCount,
      warnings: result.warnings,
      ...buildJobSpec(input),
    })

    return { outcome: downloadOutcome }
  }
}

export function formatExportOutcomeNotice(outcome: ExportOutcome): string {
  switch (outcome.status) {
    case 'download_completed':
      return outcome.savedFileName
        ? `请款单已导出并确认下载完成：${outcome.savedFileName}（共填入 ${outcome.blockCount} 个事项块/案卷）。`
        : `请款单已导出并确认下载完成（共填入 ${outcome.blockCount} 个事项块/案卷），实际文件名请查看浏览器下载记录。`
    case 'download_started':
      return `请款单已生成并触发浏览器下载（尚未确认落盘完成）：${outcome.fileName}（共填入 ${outcome.blockCount} 个事项块/案卷）。`
    case 'generated':
      return `已生成请款单工作簿：${outcome.fileName}（共填入 ${outcome.blockCount} 个事项块/案卷）。`
    case 'batch_completed': {
      const completedCount = outcome.items.filter(item => item.status === 'download_completed').length
      const startedCount = outcome.items.filter(item => item.status === 'download_started').length
      const generatedCount = outcome.items.filter(item => item.status === 'generated').length
      const okNames = outcome.items
        .filter(item => item.status === 'download_completed' || item.status === 'download_started' || item.status === 'generated')
        .map(item => item.savedFileName || item.fileName)
        .filter(Boolean)
      const failedSummary = outcome.items
        .filter(item => item.status !== 'download_completed' && item.status !== 'download_started' && item.status !== 'generated')
        .map(item => `${item.customer}（${item.reason || '导出失败'}）`)
      const preview = okNames.slice(0, 3).join('、') + (okNames.length > 3 ? ` 等 ${okNames.length} 份` : '')
      if (outcome.failedCount === 0 && completedCount === outcome.totalCount) {
        return `已按客户分表批量导出 ${outcome.successCount}/${outcome.totalCount} 份（共填入 ${outcome.blockCount} 个事项块/案卷）：${preview}。`
      }
      const parts: string[] = []
      if (completedCount > 0) parts.push(`已确认下载完成 ${completedCount} 份`)
      if (startedCount > 0) parts.push(`已触发下载（尚未确认落盘完成）${startedCount} 份`)
      if (generatedCount > 0) parts.push(`已生成工作簿（未下载）${generatedCount} 份`)
      if (outcome.failedCount > 0) {
        parts.push(`失败/待核对 ${outcome.failedCount} 份（${failedSummary.join('；')}）`)
      }
      if (outcome.failedCount === 0) {
        if (startedCount === outcome.totalCount) {
          return `已按客户分表触发浏览器下载 ${startedCount}/${outcome.totalCount} 份（尚未确认落盘完成，共填入 ${outcome.blockCount} 个事项块/案卷）：${preview}。`
        }
        if (generatedCount === outcome.totalCount) {
          return `已按客户分表生成请款工作簿 ${generatedCount}/${outcome.totalCount} 份（尚未触发浏览器下载，共填入 ${outcome.blockCount} 个事项块/案卷）：${preview}。`
        }
        return `按客户分表批量处理 ${outcome.totalCount} 份（共填入 ${outcome.blockCount} 个事项块/案卷）：${parts.join('，')}：${preview}。`
      }
      return `按客户分表批量导出结束：${parts.join('，')}。`
    }
    case 'download_interrupted':
    case 'unknown':
    case 'failed':
      return outcome.reason
  }
}
