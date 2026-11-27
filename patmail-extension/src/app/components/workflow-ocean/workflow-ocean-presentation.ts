import type { WorkflowDefinition } from '../../../workflow/catalog'
import type {
  WorkflowOceanCardView,
  WorkflowOceanHeroStats,
  WorkflowOceanIconId,
  WorkflowOceanMode,
  WorkflowOceanTone
} from './workflow-ocean.types'

type WorkflowScreen =
  | 'sea'
  | 'ocean'
  | 'flow'
  | 'jihua'
  | 'hague'
  | 'billing'
  | 'pctNotice'
  | 'feeReduce'

interface CatalogPresentationMeta {
  badge: string
  meta: string
  icon: WorkflowOceanIconId
  tone: WorkflowOceanTone
}

const CATALOG_PRESENTATION: Record<string, CatalogPresentationMeta> = {
  'pct-reminder': {
    badge: '自动发文',
    meta: '9 步 · 表格解析 · 合并发文',
    icon: 'pct-bell',
    tone: 'rose'
  },
  'pct-pengcheng': {
    badge: '自动发文',
    meta: '9 步 · 技术负责人主送 · 抄送 IPR',
    icon: 'pct-layers',
    tone: 'lilac'
  },
  'file-manage': {
    badge: '自动发文',
    meta: '8 步 · 客户配置联动 · 映射匹配',
    icon: 'file-folder',
    tone: 'peach'
  },
  'filing-export': {
    badge: '数据导出',
    meta: '5 步 · 退回脉络追溯 · Top10 图表',
    icon: 'filing-export',
    tone: 'glacier'
  }
}

const TOOL_CARDS: readonly WorkflowOceanCardView[] = [
  {
    id: 'hague',
    kind: 'tool',
    toolTarget: 'hague',
    title: '海牙新申请',
    summary: '批量校验申请材料与著录信息，多路并行填写草稿，并导出汇总表。',
    meta: '材料核对 · 6 路并行 · Summary 导出',
    badge: '批量申报',
    icon: 'hague-globe',
    tone: 'starlight',
    canUse: true,
    canGuide: true,
    canCopy: false,
    canRemove: false
  },
  {
    id: 'jihua',
    kind: 'tool',
    toolTarget: 'jihua',
    cardClass: 'jihua-upload-card',
    title: '季华实验室-文件导入',
    summary: '按申请号自动归类文件，直连已登录的季华平台核对案件并批量上传。',
    meta: '自动归类 · 6 路上传 · 逐行回执',
    badge: '文件上传',
    icon: 'jihua-flask',
    tone: 'lavender',
    canUse: true,
    canGuide: true,
    canCopy: false,
    canRemove: false
  },
  {
    id: 'billing',
    kind: 'tool',
    toolTarget: 'billing',
    cardClass: 'billing-workflow-card',
    title: '请款',
    summary: '支持涉外与 PCT 请款：自动抓取账单联动查费，带人行汇率原式导出。',
    meta: '账单抓取 · 费用联动 · 原式导出',
    badge: '费用请款',
    icon: 'billing-coins',
    tone: 'champagne',
    canUse: true,
    canGuide: true,
    canCopy: false,
    canRemove: false
  },
  {
    id: 'pctNotice',
    kind: 'tool',
    toolTarget: 'pctNotice',
    cardClass: 'pct-notice-workflow-card',
    title: 'pct官文下载上传',
    summary: '大小客户双系统并行：比对未导入官文，自动清理前缀并完成两轮回传。',
    meta: '双系统并行 · 增量比对 · 自动回传',
    badge: '官文同步',
    icon: 'pct-cloud',
    tone: 'sky',
    canUse: true,
    canGuide: true,
    canCopy: false,
    canRemove: false
  },
  {
    id: 'feeReduce',
    kind: 'tool',
    toolTarget: 'feeReduce',
    cardClass: 'fee-reduce-workflow-card',
    title: '请求费用减缓',
    summary: '按我方文号识别处理状态，撰写中案件自动创建费减递交、转档并提初核。',
    meta: '状态筛选 · XML 转档 · 提交初核',
    badge: '费减办理',
    icon: 'fee-shield',
    tone: 'sakura',
    canUse: true,
    canGuide: true,
    canCopy: false,
    canRemove: false
  }
]

export function oceanModeForScreen(screen: WorkflowScreen): WorkflowOceanMode {
  if (screen === 'sea') return 'sea'
  if (screen === 'ocean') return 'ocean'
  return 'workbench'
}

export function buildWorkflowOceanCards(
  workflows: readonly WorkflowDefinition[],
  helpers: {
    isSystem: (flow: WorkflowDefinition) => boolean
    canUse: (flow: WorkflowDefinition) => boolean
    hasGuide: (flow: WorkflowDefinition) => boolean
  }
): WorkflowOceanCardView[] {
  const catalogCards: WorkflowOceanCardView[] = workflows.map(flow => {
    const preset = CATALOG_PRESENTATION[flow.id]
    const system = helpers.isSystem(flow)
    return {
      id: flow.id,
      kind: 'catalog',
      title: flow.label,
      summary: flow.summary,
      meta: preset?.meta ?? `${flow.steps.length} 步 · 自定义流程`,
      badge: preset?.badge ?? (system ? '系统流程' : '自定义'),
      icon: preset?.icon ?? 'custom-crystal',
      tone: preset?.tone ?? 'prism',
      canUse: helpers.canUse(flow),
      canGuide: helpers.hasGuide(flow),
      canCopy: true,
      canRemove: !system
    }
  })

  return [...catalogCards, ...TOOL_CARDS]
}

export function buildWorkflowOceanStats(cards: readonly WorkflowOceanCardView[]): WorkflowOceanHeroStats {
  const custom = cards.filter(card => card.canRemove).length
  return {
    total: cards.length,
    systemAndTool: cards.length - custom,
    custom
  }
}
