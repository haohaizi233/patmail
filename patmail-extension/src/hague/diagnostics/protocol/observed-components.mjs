import { safeComponentId } from '../schema.mjs'

export function createObservedComponentRegistry(options = {}) {
  const components = new Map()
  let generation = 0
  const maxComponents = Math.min(1024, Math.max(16, options.maxComponents ?? 256))

  function getSubstringHint(id) {
    const lower = id.toLowerCase()
    if (lower.includes('save') || lower.includes('confirm')) return 'save_action'
    if (lower.includes('upload')) return 'upload_action'
    if (lower.includes('refresh')) return 'refresh_action'
    if (lower.includes('close')) return 'close_action'
    if (lower.includes('pagin') || lower.includes('page')) return 'pagination'
    if (lower.includes('datatable') || lower.includes('_data')) return 'data_table'
    return 'general_component'
  }

  function inferRoleWithEvidence(input) {
    const hint = getSubstringHint(input.componentId)

    // Multi-source evidence evaluation:
    // Requires independent corroboration: Observed DOM evidence + AST static evidence + Request source evidence
    const hasDom = !!input.domEvidence || input.sourceEvidence?.includes('dom')
    const hasAst = !!input.astEvidence || input.sourceEvidence?.includes('ast')
    const hasReq = !!input.requestEvidence || input.sourceEvidence?.includes('request')

    const evidenceSourcesCount = (hasDom ? 1 : 0) + (hasAst ? 1 : 0) + (hasReq ? 1 : 0)

    // Substring alone without multi-layer evidence cannot prove a business role
    if (evidenceSourcesCount < 2 && input.confidence !== 'exact') {
      return {
        role: 'unknown',
        candidateRoleHint: hint !== 'general_component' ? `candidate_${hint}` : undefined,
        confidence: 'unresolved'
      }
    }

    // With multi-layer evidence or explicit exact confidence from verified AST+DOM
    return {
      role: hint,
      candidateRoleHint: undefined,
      confidence: input.confidence === 'exact' ? 'exact' : 'probable'
    }
  }

  return {
    registerComponent(input) {
      if (!input || typeof input.componentId !== 'string') {
        throw new Error('componentId required')
      }

      const safeId = safeComponentId(input.componentId)
      const inferred = inferRoleWithEvidence(input)
      const role = input.componentRole || inferred.role
      const confidence = input.componentRole ? (input.confidence || 'probable') : inferred.confidence

      // Dynamic ID re-use check: if an existing component is replaced across different containers
      const existing = components.get(safeId)
      if (existing && existing.namingContainer && input.namingContainer && existing.namingContainer !== input.namingContainer) {
        // Container mismatch indicates dynamic ID renumbering/reuse
        components.delete(safeId)
      }

      const item = {
        componentId: safeId,
        namingContainer: input.namingContainer ? safeComponentId(input.namingContainer) : undefined,
        formId: input.formId ? safeComponentId(input.formId) : undefined,
        widgetType: input.widgetType ? String(input.widgetType).slice(0, 64) : undefined,
        componentRole: role,
        candidateRoleHint: inferred.candidateRoleHint,
        sourceEvidence: input.sourceEvidence ? String(input.sourceEvidence).slice(0, 64) : 'none',
        // Never authorizes automated writes or serves as business success receipt
        canAuthorizeWrite: false,
        authoritativeReceipt: false,
        generation,
        confidence
      }

      if (components.size >= maxComponents) {
        components.delete(components.keys().next().value)
      }
      components.set(safeId, item)
      return item
    },

    getComponent(componentId) {
      if (typeof componentId !== 'string') return undefined
      return components.get(safeComponentId(componentId))
    },

    clear() {
      generation++
      components.clear()
    },

    size() {
      return components.size
    }
  }
}
