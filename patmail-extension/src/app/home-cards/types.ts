import type { LimitMailMark } from '../../customer/limit-mail-submit'
import type { WorkspaceResultPayload } from '../../shared/message'
import type { WorkflowDefinition } from '../../workflow/catalog'
import type { HomeReport, ReportSlice } from '../home-report'

export type HomeCardTone = 'pink' | 'blue' | 'orange' | 'green' | 'purple' | 'sky' | 'rose'

export interface HomeCardContext {
  report: HomeReport
  customers: WorkspaceResultPayload['customers']
  tasks: WorkspaceResultPayload['tasks']
  templates: WorkspaceResultPayload['templates']
  fileManageRuns: WorkspaceResultPayload['fileManageRuns']
  ledger: readonly LimitMailMark[]
  workflows: readonly WorkflowDefinition[]
}

interface HomeCardBase {
  id: string
  title: string
  description?: string
  order: number
  defaultEnabled: boolean
  route?: string
}

export interface HomeMetricCardDef extends HomeCardBase {
  kind: 'metric'
  tone: HomeCardTone
  icon: string
  value: (ctx: HomeCardContext) => number | string
  subtitle: (ctx: HomeCardContext) => string
}

export interface HomeBoardCardDef extends HomeCardBase {
  kind: 'board'
  slices: (ctx: HomeCardContext) => ReportSlice[]
  note?: (ctx: HomeCardContext) => string
}

export type HomeCardDef = HomeMetricCardDef | HomeBoardCardDef

export type HomeCardVisibility = Record<string, boolean>
