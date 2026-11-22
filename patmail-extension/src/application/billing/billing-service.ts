import type { PbcRates } from '../../billing/pbc-rates'
import type { BillingInput, BillingTemplateId } from '../../billing/templates'
import type { BillingDeskSnapshot, ExportBillingCommand, ExportOutcome } from './billing-contracts'
import { validateBillingExportPreconditions } from './billing-validation'
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

  async exportBilling(
    command: ExportBillingCommand,
  ): Promise<{ outcome: ExportOutcome; needsRateRefresh?: boolean }> {
    const validation = validateBillingExportPreconditions(command)
    if (!validation.ok) {
      return {
        outcome: { status: 'failed', reason: validation.reason },
        ...(validation.needsRateRefresh ? { needsRateRefresh: true } : {}),
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
      today: command.today ?? new Date(),
    }

    const rawBytes = await this.ports.templates.loadTemplate(command.templateId)
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
    })

    return { outcome: downloadOutcome }
  }
}

export function formatExportOutcomeNotice(outcome: ExportOutcome): string {
  switch (outcome.status) {
    case 'download_started':
    case 'download_completed':
      return `请款单已成功导出并触发下载：${outcome.fileName}（共填入 ${outcome.blockCount} 个事项块/案卷）。`
    case 'generated':
      return `已生成请款单工作簿：${outcome.fileName}（共填入 ${outcome.blockCount} 个事项块/案卷）。`
    case 'download_interrupted':
    case 'unknown':
    case 'failed':
      return outcome.reason
  }
}
