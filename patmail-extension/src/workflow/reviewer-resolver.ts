import { isQueryGuid } from '../query/query-validator'
import type { WorkflowNode, WorkflowReviewer } from './types'

/** 只返回当前选中节点上的候选人，不把其他节点的人员并进来。 */
export function reviewersForNode(nodes: WorkflowNode[], nodeId: string): WorkflowReviewer[] {
  if (!nodeId) return []
  return nodes.find(node => node.nodeId.toLowerCase() === nodeId.toLowerCase())?.reviewers ?? []
}

export type ReviewerResolution =
  | { status: 'matched'; reviewer: WorkflowReviewer }
  | { status: 'blocked'; reason: string }

/** 发文映射配置的人选按 GUID 匹配；操作账号不参与审核人兜底。 */
export function resolveConfiguredReviewer(reviewerId: string | null | undefined, node: WorkflowNode): ReviewerResolution {
  if (!reviewerId || !isQueryGuid(reviewerId)) return { status: 'blocked', reason: '还没有默认审核人。请到发文映射里设置。' }
  if (node.reviewerFormat === 'unknown') return { status: 'blocked', reason: '下一节点没有已确认的审核人，没有提交。' }
  const matches = node.reviewers.filter(person => person.id.toLowerCase() === reviewerId.toLowerCase())
  if (matches.length !== 1 || !matches[0].name.trim()) return { status: 'blocked', reason: '默认审核人未在下一节点唯一匹配，没有提交。' }
  return { status: 'matched', reviewer: { ...matches[0], name: matches[0].name.trim() } }
}

/**
 * 只接受当前用户 GUID 与候选 GUID 相同。
 * 姓名相同、缺少 GUID、或候选人里没有当前用户，都保持阻塞。
 */
export function resolveReviewer(currentUserId: string | null, node: WorkflowNode, selectedId = ''): ReviewerResolution {
  if (!currentUserId || !isQueryGuid(currentUserId)) return { status: 'blocked', reason: '当前 EASY 用户 GUID 还没有确认。' }
  if (node.reviewerFormat === 'unknown' || node.reviewers.length === 0) {
    return { status: 'blocked', reason: '候选人缺少已确认的内部 GUID，不能按姓名选择。' }
  }
  const names = new Map<string, number>()
  for (const reviewer of node.reviewers) {
    if (!isQueryGuid(reviewer.id)) return { status: 'blocked', reason: '候选人缺少已确认的内部 GUID，不能按姓名选择。' }
    const name = reviewer.name.trim()
    if (name) names.set(name, (names.get(name) ?? 0) + 1)
  }
  if ([...names.values()].some(count => count > 1) && !selectedId) {
    return { status: 'blocked', reason: '存在多个同名审核人，不能按姓名选择。' }
  }
  const self = node.reviewers.find(reviewer => reviewer.id.toLowerCase() === currentUserId.toLowerCase())
  if (!self) return { status: 'blocked', reason: '当前用户不在候选审核人中，不能改选其他人。' }
  if (selectedId && selectedId.toLowerCase() !== currentUserId.toLowerCase()) {
    return { status: 'blocked', reason: '不能选择当前用户以外的审核人。' }
  }
  return { status: 'matched', reviewer: self }
}
