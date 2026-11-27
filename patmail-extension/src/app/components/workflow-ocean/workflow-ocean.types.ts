export type WorkflowOceanIconId =
  | 'pct-bell'
  | 'pct-layers'
  | 'file-folder'
  | 'filing-export'
  | 'hague-globe'
  | 'jihua-flask'
  | 'billing-coins'
  | 'pct-cloud'
  | 'fee-shield'
  | 'ocean-add'
  | 'custom-crystal'

export type WorkflowOceanTone =
  | 'rose'
  | 'lilac'
  | 'peach'
  | 'glacier'
  | 'starlight'
  | 'lavender'
  | 'champagne'
  | 'sky'
  | 'sakura'
  | 'prism'

export type WorkflowOceanMode = 'sea' | 'ocean' | 'workbench'

export type WorkflowToolTarget = 'hague' | 'jihua' | 'billing' | 'pctNotice' | 'feeReduce'

export interface WorkflowOceanCardView {
  id: string
  kind: 'catalog' | 'tool'
  toolTarget?: WorkflowToolTarget
  cardClass?: string
  title: string
  summary: string
  meta: string
  badge: string
  icon: WorkflowOceanIconId
  tone: WorkflowOceanTone
  canUse: boolean
  canGuide: boolean
  canCopy: boolean
  canRemove: boolean
}

export interface WorkflowOceanHeroStats {
  total: number
  systemAndTool: number
  custom: number
}
