import { safeComponentId } from '../schema.mjs'

export function createObservedComponentRegistry(options = {}) {
  const components = new Map()
  let generation = 0
  const maxComponents = Math.min(1024, Math.max(16, options.maxComponents ?? 256))

  function inferRole(comp) {
    if (comp.confidence !== 'exact' && comp.confidence !== 'probable') {
      return 'unknown'
    }
    const id = comp.componentId.toLowerCase()
    if (id.includes('save') || id.includes('confirm')) return 'save_action'
    if (id.includes('upload')) return 'upload_action'
    if (id.includes('refresh')) return 'refresh_action'
    if (id.includes('close')) return 'close_action'
    if (id.includes('pagin') || id.includes('page')) return 'pagination'
    if (id.includes('datatable') || id.includes('_data')) return 'data_table'
    return 'general_component'
  }

  return {
    registerComponent(input) {
      if (!input || typeof input.componentId !== 'string') {
        throw new Error('componentId required')
      }

      const safeId = safeComponentId(input.componentId)
      const confidence = ['exact', 'probable', 'unresolved'].includes(input.confidence) ? input.confidence : 'unresolved'
      const role = input.componentRole || inferRole({ componentId: input.componentId, confidence })

      const item = {
        componentId: safeId,
        namingContainer: input.namingContainer ? safeComponentId(input.namingContainer) : undefined,
        formId: input.formId ? safeComponentId(input.formId) : undefined,
        widgetType: input.widgetType ? String(input.widgetType).slice(0, 64) : undefined,
        componentRole: role,
        sourceEvidence: input.sourceEvidence ? String(input.sourceEvidence).slice(0, 64) : 'none',
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
