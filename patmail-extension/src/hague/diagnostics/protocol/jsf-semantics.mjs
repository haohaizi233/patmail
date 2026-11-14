import { SaxesParser } from 'saxes'
import { safeComponentId, safePath } from '../schema.mjs'

const MAX_BYTES = 256 * 1024
const MAX_NODES = 30000
const MAX_DEPTH = 100
const MAX_ACTIONS = 500

const viewIdRegex = /^(?:[A-Za-z0-9_.-]{1,64}:){0,8}(?:javax|jakarta)\.faces\.ViewState(?::\d{1,10})?$/
const isViewStateId = id => typeof id === 'string' && id.length <= 200 && viewIdRegex.test(id)

const KNOWN_NODES = new Set([
  'partial-response',
  'changes',
  'update',
  'insert',
  'before',
  'after',
  'delete',
  'attributes',
  'attribute',
  'eval',
  'extension',
  'error',
  'error-name',
  'error-message',
  'redirect'
])

function limit(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, fallback) : fallback
}

export function safeErrorCategory(name, message) {
  const text = `${name || ''} ${message || ''}`.toLowerCase()
  if (text.includes('viewexpired') || text.includes('view expired')) return 'view_expired'
  if (text.includes('conversion') || text.includes('converter')) return 'conversion_error'
  if (text.includes('validation') || text.includes('validator')) return 'validation_error'
  if (text.includes('nosuchmethod') || text.includes('evaluationexception') || text.includes('propertynotfound')) return 'expression_error'
  if (text.includes('timeout') || text.includes('timed out')) return 'timeout'
  return 'internal_server_error'
}

export function parseJsfProtocol(body, options = {}) {
  const unresolvedReasons = []
  const actions = []
  const protocolErrors = []
  const updatedComponents = []
  const expectedUpdates = []
  const views = []
  let detectedNamespace = 'unknown' // 'javax' | 'jakarta' | 'mixed' | 'unknown'
  let viewStateJavax = false
  let viewStateJakarta = false
  let viewStatePresent = false
  let viewStateLength = 0
  let redirectDetected = false
  let redirectUrlPath = undefined
  let validationFailed = false
  let jsfError = false

  const stats = {
    updateCount: 0,
    insertCount: 0,
    deleteCount: 0,
    attributeCount: 0,
    evalCount: 0,
    extensionCount: 0,
    unknownNodeCount: 0,
    nodes: 0
  }

  let text
  try {
    text = typeof body === 'string' ? body : new TextDecoder('utf-8', { fatal: true }).decode(body ?? new Uint8Array())
  } catch {
    return {
      recognized: false,
      namespace: 'unknown',
      kind: 'malformed',
      actions: [],
      viewState: { present: false, length: 0, namespace: 'unknown', count: 0 },
      validation: { failed: false, evidenceSource: 'none' },
      protocolErrors: [],
      protocolStatus: 'invalid_xml',
      errorCode: 'INVALID_XML',
      parserError: true,
      bodyStatus: 'body_parse_failed',
      xmlParsed: false,
      updatedComponents: [],
      expectedUpdates: [],
      unresolvedReasons: ['invalid_utf8_encoding'],
      stats
    }
  }

  const byteLen = new TextEncoder().encode(text).byteLength
  if (byteLen > limit(options.maxBytes, MAX_BYTES)) {
    return {
      recognized: false,
      namespace: 'unknown',
      kind: 'unsupported',
      actions: [],
      viewState: { present: false, length: 0, namespace: 'unknown', count: 0 },
      validation: { failed: false, evidenceSource: 'none' },
      protocolErrors: [],
      protocolStatus: 'unsupported',
      errorCode: 'PROTOCOL_UNSUPPORTED',
      bodyStatus: 'body_too_large',
      xmlParsed: false,
      updatedComponents: [],
      expectedUpdates: [],
      unresolvedReasons: ['body_too_large'],
      stats
    }
  }

  const trimmed = text.trim()
  if (!trimmed) {
    return {
      recognized: false,
      namespace: 'unknown',
      kind: 'empty',
      actions: [],
      viewState: { present: false, length: 0, namespace: 'unknown', count: 0 },
      validation: { failed: false, evidenceSource: 'none' },
      protocolErrors: [],
      protocolStatus: 'empty',
      errorCode: 'EMPTY_RESPONSE',
      bodyStatus: 'body_available',
      xmlParsed: false,
      updatedComponents: [],
      expectedUpdates: [],
      unresolvedReasons: ['empty_response'],
      stats
    }
  }

  if (/^(?:<!doctype\s+html|<html\b)/i.test(trimmed)) {
    return {
      recognized: false,
      namespace: 'unknown',
      kind: 'full_html',
      actions: [],
      viewState: { present: false, length: 0, namespace: 'unknown', count: 0 },
      validation: { failed: false, evidenceSource: 'none' },
      protocolErrors: [],
      protocolStatus: 'html',
      errorCode: 'PROTOCOL_UNSUPPORTED',
      bodyStatus: 'body_unsupported',
      xmlParsed: false,
      updatedComponents: [],
      expectedUpdates: [],
      unresolvedReasons: ['html_response'],
      stats
    }
  }

  const mime = (options.mime ?? '').split(';')[0].trim().toLowerCase()
  if (mime && !['text/xml', 'application/xml', 'application/xhtml+xml'].includes(mime) && !mime.endsWith('+xml')) {
    return {
      recognized: false,
      namespace: 'unknown',
      kind: 'unsupported',
      actions: [],
      viewState: { present: false, length: 0, namespace: 'unknown', count: 0 },
      validation: { failed: false, evidenceSource: 'none' },
      protocolErrors: [],
      protocolStatus: 'unsupported',
      errorCode: 'INVALID_MIME',
      bodyStatus: 'body_unsupported',
      xmlParsed: false,
      updatedComponents: [],
      expectedUpdates: [],
      unresolvedReasons: ['invalid_mime'],
      stats
    }
  }

  if (/^[{[]/.test(trimmed)) {
    return {
      recognized: false,
      namespace: 'unknown',
      kind: 'unsupported',
      actions: [],
      viewState: { present: false, length: 0, namespace: 'unknown', count: 0 },
      validation: { failed: false, evidenceSource: 'none' },
      protocolErrors: [],
      protocolStatus: 'unsupported',
      errorCode: 'PROTOCOL_UNSUPPORTED',
      bodyStatus: 'body_unsupported',
      xmlParsed: false,
      updatedComponents: [],
      expectedUpdates: [],
      unresolvedReasons: ['json_payload'],
      stats
    }
  }

  const stack = []
  let root = ''
  let invalid = false
  let currentError = null

  const parser = new SaxesParser({ xmlns: true })
  parser.on('error', () => {
    invalid = true
    throw new Error('invalid_xml')
  })
  parser.on('doctype', () => {
    invalid = true
    throw new Error('forbidden_doctype')
  })

  parser.on('opentag', tag => {
    stats.nodes++
    if (stats.nodes > limit(options.maxNodes, MAX_NODES) || stack.length >= limit(options.maxDepth, MAX_DEPTH)) {
      invalid = true
      throw new Error('xml_limit')
    }

    const name = tag.local
    const attrs = Object.values(tag.attributes)
    const idVal = attrs.find(a => a.local === 'id')?.value ?? ''
    const urlVal = attrs.find(a => a.local === 'url')?.value ?? ''
    const lnVal = attrs.find(a => a.local === 'ln')?.value ?? ''
    const typeVal = attrs.find(a => a.local === 'type')?.value ?? ''

    const frame = { name, id: idVal, url: urlVal, ln: lnVal, type: typeVal, text: '' }
    if (!stack.length) root = name
    stack.push(frame)

    if (!KNOWN_NODES.has(name)) {
      stats.unknownNodeCount++
      unresolvedReasons.push(`unknown_node:${name}`)
    }

    if (name === 'update') {
      stats.updateCount++
      const isVs = isViewStateId(idVal)
      if (isVs) {
        viewStatePresent = true
        if (idVal.includes('javax.faces.ViewState')) viewStateJavax = true
        if (idVal.includes('jakarta.faces.ViewState')) viewStateJakarta = true
      } else if (idVal && updatedComponents.length < 120) {
        const safeId = safeComponentId(idVal)
        if (!updatedComponents.includes(safeId)) {
          updatedComponents.push(safeId)
          expectedUpdates.push(safeId)
        }
      }
      if (actions.length < MAX_ACTIONS) {
        actions.push({
          action: 'update',
          id: isVs ? 'ViewState' : safeComponentId(idVal),
          isViewState: isVs,
          isViewRoot: idVal === 'javax.faces.ViewRoot' || idVal === 'jakarta.faces.ViewRoot'
        })
      }
    } else if (name === 'insert') {
      stats.insertCount++
      if (actions.length < MAX_ACTIONS) {
        actions.push({
          action: 'insert',
          id: idVal ? safeComponentId(idVal) : undefined
        })
      }
    } else if (name === 'delete') {
      stats.deleteCount++
      if (idVal && updatedComponents.length < 120) {
        const safeId = safeComponentId(idVal)
        if (!updatedComponents.includes(safeId)) updatedComponents.push(safeId)
      }
      if (actions.length < MAX_ACTIONS) {
        actions.push({
          action: 'delete',
          id: safeComponentId(idVal)
        })
      }
    } else if (name === 'attributes') {
      stats.attributeCount++
      if (actions.length < MAX_ACTIONS) {
        actions.push({
          action: 'attributes',
          id: safeComponentId(idVal)
        })
      }
    } else if (name === 'eval') {
      stats.evalCount++
      if (actions.length < MAX_ACTIONS) {
        actions.push({ action: 'eval' })
      }
    } else if (name === 'extension') {
      stats.extensionCount++
      if (actions.length < MAX_ACTIONS) {
        actions.push({
          action: 'extension',
          ln: lnVal ? String(lnVal).slice(0, 32) : undefined,
          type: typeVal ? String(typeVal).slice(0, 32) : undefined
        })
      }
    } else if (name === 'error') {
      jsfError = true
      currentError = { errorName: '', errorMessage: '' }
      if (actions.length < MAX_ACTIONS) {
        actions.push({ action: 'error' })
      }
    } else if (name === 'redirect') {
      redirectDetected = true
      redirectUrlPath = safePath(urlVal)
      if (actions.length < MAX_ACTIONS) {
        actions.push({
          action: 'redirect',
          urlPath: redirectUrlPath
        })
      }
    }
  })

  const content = value => {
    for (let i = stack.length - 1; i >= 0; i--) {
      const frame = stack[i]
      if (frame.name === 'extension' ||
          (frame.name === 'update' && isViewStateId(frame.id)) ||
          frame.name === 'error-name' ||
          frame.name === 'error-message') {
        frame.text += value
        break
      }
    }
  }

  parser.on('text', content)
  parser.on('cdata', content)

  parser.on('closetag', () => {
    const frame = stack.pop()
    if (!frame) return

    if (frame.name === 'update' && isViewStateId(frame.id)) {
      viewStateLength += frame.text.length
      views.push(frame.text)
    }

    if (frame.name === 'extension') {
      try {
        const parsed = JSON.parse(frame.text)
        if (parsed && typeof parsed === 'object' && parsed.validationFailed === true) {
          validationFailed = true
        }
      } catch {
        // non-JSON extension
      }
    }

    if (frame.name === 'error-name' && currentError) {
      const parts = frame.text.trim().split('.')
      currentError.errorName = parts[parts.length - 1] || 'JsfError'
    }

    if (frame.name === 'error-message' && currentError) {
      currentError.errorMessage = frame.text.trim()
    }

    if (frame.name === 'error' && currentError) {
      const category = safeErrorCategory(currentError.errorName, currentError.errorMessage)
      protocolErrors.push({
        errorName: currentError.errorName || 'Error',
        category
      })
      currentError = null
    }
  })

  try {
    parser.write(text).close()
  } catch {
    invalid = true
  }

  if (invalid) {
    return {
      recognized: false,
      namespace: 'unknown',
      kind: 'malformed',
      actions: [],
      viewState: { present: false, length: 0, namespace: 'unknown', count: 0 },
      validation: { failed: false, evidenceSource: 'none' },
      protocolErrors: [],
      protocolStatus: 'invalid_xml',
      errorCode: 'INVALID_XML',
      parserError: true,
      bodyStatus: 'body_parse_failed',
      xmlParsed: false,
      updatedComponents: [],
      expectedUpdates: [],
      unresolvedReasons: ['invalid_xml_structure'],
      stats
    }
  }

  if (root !== 'partial-response') {
    return {
      recognized: false,
      namespace: 'unknown',
      kind: 'unsupported',
      actions: [],
      viewState: { present: false, length: 0, namespace: 'unknown', count: 0 },
      validation: { failed: false, evidenceSource: 'none' },
      protocolErrors: [],
      protocolStatus: 'unsupported',
      errorCode: 'PROTOCOL_UNSUPPORTED',
      bodyStatus: 'body_unsupported',
      xmlParsed: true,
      updatedComponents: [],
      expectedUpdates: [],
      unresolvedReasons: ['root_not_partial_response'],
      stats
    }
  }

  if (viewStateJavax && viewStateJakarta) detectedNamespace = 'mixed'
  else if (viewStateJavax) detectedNamespace = 'javax'
  else if (viewStateJakarta) detectedNamespace = 'jakarta'

  let protocolStatus = 'valid'
  let errorCode = undefined
  let kind = 'partial_response'

  if (jsfError) {
    protocolStatus = 'jsf_error'
    errorCode = 'JSF_ERROR'
  } else if (validationFailed) {
    protocolStatus = 'jsf_validation_failed'
    errorCode = 'JSF_VALIDATION_FAILED'
  } else if (redirectDetected) {
    protocolStatus = 'redirect'
    errorCode = 'JSF_REDIRECT'
    kind = 'redirect'
  }

  return {
    recognized: true,
    namespace: detectedNamespace,
    kind,
    actions,
    viewState: {
      present: viewStatePresent,
      length: viewStateLength,
      namespace: detectedNamespace === 'mixed' ? 'mixed' : detectedNamespace,
      count: views.length
    },
    viewStatePresent,
    viewStateLength,
    validation: {
      failed: validationFailed,
      evidenceSource: validationFailed ? 'extension_args' : 'none'
    },
    redirect: redirectDetected ? { detected: true, urlPath: redirectUrlPath } : undefined,
    protocolErrors,
    protocolStatus,
    errorCode,
    xmlParsed: true,
    parserError: false,
    jsfError,
    validationFailed,
    redirectDetected,
    bodyStatus: 'body_available',
    updateCount: stats.updateCount,
    insertCount: stats.insertCount,
    deleteCount: stats.deleteCount,
    attributeCount: stats.attributeCount,
    evalCount: stats.evalCount,
    extensionCount: stats.extensionCount,
    unknownNodeCount: stats.unknownNodeCount,
    updatedComponents,
    expectedUpdates,
    unresolvedReasons,
    stats
  }
}

/**
 * Compare SAX result against DOMParser semantic facts on the exact same XML.
 * Confirms consistency without creating business side effects.
 */
export function compareJsfDualParsers(xmlText) {
  const saxResult = parseJsfProtocol(xmlText)

  // DOMParser parse
  let domResult = { updateCount: 0, viewStatePresent: false, validationFailed: false, jsfError: false }
  try {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml')
    const hasParserError = !!doc.querySelector('parsererror')
    if (!hasParserError) {
      const updates = doc.querySelectorAll('update')
      let vsPresent = false
      for (const u of updates) {
        if (isViewStateId(u.id)) vsPresent = true
      }
      let valFailed = false
      for (const ext of doc.querySelectorAll('extension')) {
        try {
          const parsed = JSON.parse(ext.textContent ?? '')
          if (parsed && typeof parsed === 'object' && parsed.validationFailed === true) valFailed = true
        } catch {}
      }
      domResult = {
        updateCount: updates.length,
        viewStatePresent: vsPresent,
        validationFailed: valFailed,
        jsfError: !!doc.querySelector('error')
      }
    }
  } catch {}

  const consistent =
    saxResult.updateCount === domResult.updateCount &&
    saxResult.viewState.present === domResult.viewStatePresent &&
    saxResult.validation.failed === domResult.validationFailed &&
    saxResult.jsfError === domResult.jsfError

  return { consistent, saxResult, domResult }
}
