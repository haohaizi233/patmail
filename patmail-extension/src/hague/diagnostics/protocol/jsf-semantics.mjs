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

export const KNOWN_ERROR_CATEGORIES = new Set([
  'view_expired',
  'validation_error',
  'conversion_error',
  'protocol_error',
  'expression_error',
  'timeout',
  'internal_server_error',
  'unknown_jsf_error'
])

const VETTED_ERROR_NAMES = {
  view_expired: 'ViewExpiredException',
  validation_error: 'ValidationException',
  conversion_error: 'ConverterException',
  protocol_error: 'ProtocolException',
  expression_error: 'ExpressionException',
  timeout: 'TimeoutException',
  internal_server_error: 'InternalServerError',
  unknown_jsf_error: 'UnknownJsfError'
}

export function safeErrorCategory(name, message) {
  const text = `${name || ''} ${message || ''}`.toLowerCase()
  if (text.includes('viewexpired') || text.includes('view expired')) return 'view_expired'
  if (text.includes('conversion') || text.includes('converter')) return 'conversion_error'
  if (text.includes('validation') || text.includes('validator')) return 'validation_error'
  if (text.includes('protocol') || text.includes('partialresponse') || text.includes('malformed')) return 'protocol_error'
  if (text.includes('nosuchmethod') || text.includes('evaluationexception') || text.includes('propertynotfound')) return 'expression_error'
  if (text.includes('timeout') || text.includes('timed out')) return 'timeout'
  if (text.includes('nullpointer') || text.includes('illegalargument') || text.includes('server') || text.includes('internal')) return 'internal_server_error'
  return 'unknown_jsf_error'
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

  const earlyFailure = base => ({
    recognized: false,
    namespace: 'unknown',
    actions: [],
    viewState: { present: false, length: 0, namespace: 'unknown', count: 0 },
    viewStatePresent: false,
    viewStateLength: 0,
    validation: { failed: false, evidenceSource: 'none' },
    protocolErrors: [],
    parserError: false,
    jsfError: false,
    validationFailed: false,
    redirectDetected: false,
    updateCount: 0,
    insertCount: 0,
    deleteCount: 0,
    attributeCount: 0,
    evalCount: 0,
    extensionCount: 0,
    unknownNodeCount: 0,
    updatedComponents: [],
    expectedUpdates: [],
    stats,
    ...base
  })

  let text
  try {
    text = typeof body === 'string' ? body : new TextDecoder('utf-8', { fatal: true }).decode(body ?? new Uint8Array())
  } catch {
    return earlyFailure({
      kind: 'malformed',
      protocolStatus: 'invalid_xml',
      errorCode: 'INVALID_XML',
      parserError: true,
      bodyStatus: 'body_parse_failed',
      xmlParsed: false,
      unresolvedReasons: ['invalid_utf8_encoding']
    })
  }

  const byteLen = new TextEncoder().encode(text).byteLength
  if (byteLen > limit(options.maxBytes, MAX_BYTES)) {
    return earlyFailure({
      kind: 'unsupported',
      protocolStatus: 'unsupported',
      errorCode: 'PROTOCOL_UNSUPPORTED',
      bodyStatus: 'body_too_large',
      xmlParsed: false,
      unresolvedReasons: ['body_too_large']
    })
  }

  const trimmed = text.trim()
  if (!trimmed) {
    return earlyFailure({
      kind: 'empty',
      protocolStatus: 'empty',
      errorCode: 'EMPTY_RESPONSE',
      bodyStatus: 'body_available',
      xmlParsed: false,
      unresolvedReasons: ['empty_response']
    })
  }

  if (/^(?:<!doctype\s+html|<html\b)/i.test(trimmed)) {
    return earlyFailure({
      kind: 'full_html',
      protocolStatus: 'html',
      errorCode: 'PROTOCOL_UNSUPPORTED',
      bodyStatus: 'body_unsupported',
      xmlParsed: false,
      unresolvedReasons: ['html_response']
    })
  }

  const mime = (options.mime ?? '').split(';')[0].trim().toLowerCase()
  if (mime && !['text/xml', 'application/xml', 'application/xhtml+xml'].includes(mime) && !mime.endsWith('+xml')) {
    return earlyFailure({
      kind: 'unsupported',
      protocolStatus: 'unsupported',
      errorCode: 'INVALID_MIME',
      bodyStatus: 'body_unsupported',
      xmlParsed: false,
      unresolvedReasons: ['invalid_mime']
    })
  }

  if (/^[{[]/.test(trimmed)) {
    return earlyFailure({
      kind: 'unsupported',
      protocolStatus: 'unsupported',
      errorCode: 'PROTOCOL_UNSUPPORTED',
      bodyStatus: 'body_unsupported',
      xmlParsed: false,
      unresolvedReasons: ['json_payload']
    })
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
      const safeNode = String(name).slice(0, 32).replace(/[^a-zA-Z0-9_-]/g, '')
      unresolvedReasons.push(`unknown_node:${safeNode}`)
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
          ln: lnVal ? String(lnVal).slice(0, 32).replace(/[^a-zA-Z0-9_-]/g, '') : undefined,
          type: typeVal ? String(typeVal).slice(0, 32).replace(/[^a-zA-Z0-9_-]/g, '') : undefined
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

  const MAX_VIEWSTATE_TEXT = 65536
  const MAX_EXTENSION_TEXT = 16384
  const MAX_ERROR_NAME_TEXT = 256
  const MAX_ERROR_MSG_TEXT = 1024

  const content = value => {
    for (let i = stack.length - 1; i >= 0; i--) {
      const frame = stack[i]
      if (frame.name === 'update' && isViewStateId(frame.id)) {
        if (frame.text.length + value.length <= MAX_VIEWSTATE_TEXT) {
          frame.text += value
        }
        break
      }
      if (frame.name === 'extension') {
        if (frame.text.length + value.length <= MAX_EXTENSION_TEXT) {
          frame.text += value
        }
        break
      }
      if (frame.name === 'error-name') {
        if (frame.text.length + value.length <= MAX_ERROR_NAME_TEXT) {
          frame.text += value
        }
        break
      }
      if (frame.name === 'error-message') {
        if (frame.text.length + value.length <= MAX_ERROR_MSG_TEXT) {
          frame.text += value
        }
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
      currentError.errorName = frame.text.trim().slice(0, 256)
    }

    if (frame.name === 'error-message' && currentError) {
      currentError.errorMessage = frame.text.trim().slice(0, 1024)
    }

    if (frame.name === 'error' && currentError) {
      const category = safeErrorCategory(currentError.errorName, currentError.errorMessage)
      const errorName = VETTED_ERROR_NAMES[category] || 'UnknownJsfError'
      protocolErrors.push({
        errorName,
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
    return earlyFailure({
      kind: 'malformed',
      protocolStatus: 'invalid_xml',
      errorCode: 'INVALID_XML',
      parserError: true,
      bodyStatus: 'body_parse_failed',
      xmlParsed: false,
      unresolvedReasons: ['invalid_xml_structure']
    })
  }

  if (root !== 'partial-response') {
    return earlyFailure({
      kind: 'unsupported',
      protocolStatus: 'unsupported',
      errorCode: 'PROTOCOL_UNSUPPORTED',
      bodyStatus: 'body_unsupported',
      xmlParsed: true,
      unresolvedReasons: ['root_not_partial_response']
    })
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

  if (options.onViewState && views.length) {
    try { options.onViewState(views) } catch {}
  }

  const result = {
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

  // Internal temporary reference for HMAC state machine within worker turn (never serialized)
  Object.defineProperty(result, '_rawViewState', {
    value: views.length ? views[views.length - 1] : null,
    enumerable: false,
    writable: true,
    configurable: true
  })

  return result
}

/**
 * Extracts protocol facts using browser/DOMParser semantics, exactly mirroring
 * the production xmlEvidence() and http-context.ts fact identification.
 */
export function extractHttpProtocolFacts(xmlText) {
  let xmlParsed = false
  let parserError = false
  let jsfError = false
  let validationFailed = false
  let redirectDetected = false
  let updateCount = 0
  let insertCount = 0
  let deleteCount = 0
  let viewStatePresent = false
  const updatedComponents = []

  const trimmed = typeof xmlText === 'string' ? xmlText.trim() : ''
  if (/^(?:<!doctype\s+html|<html\b)/i.test(trimmed) || !/<partial-response[\s>]/.test(trimmed)) {
    return {
      xmlParsed: false,
      parserError: !/^(?:<!doctype\s+html|<html\b)/i.test(trimmed),
      jsfError: false,
      validationFailed: false,
      redirectDetected: false,
      updateCount: 0,
      insertCount: 0,
      deleteCount: 0,
      viewStatePresent: false,
      updatedComponents: []
    }
  }

  try {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml')
    const hasParserError = !!doc.querySelector('parsererror')
    if (hasParserError) {
      parserError = true
      xmlParsed = false
    } else {
      xmlParsed = true
      redirectDetected = !!doc.querySelector('redirect')
      jsfError = !!doc.querySelector('error')
      for (const node of doc.querySelectorAll('extension')) {
        try {
          const args = JSON.parse(node.textContent ?? '')
          if (args && typeof args === 'object' && args.validationFailed === true) {
            validationFailed = true
          }
        } catch {}
      }
      const updates = doc.querySelectorAll('update')
      updateCount = updates.length
      for (const u of updates) {
        const id = u.getAttribute('id') || u.id || ''
        if (isViewStateId(id)) viewStatePresent = true
        else if (id) updatedComponents.push(safeComponentId(id))
      }
      insertCount = doc.querySelectorAll('insert').length
      deleteCount = doc.querySelectorAll('delete').length
    }
  } catch {
    parserError = true
    xmlParsed = false
  }

  return {
    xmlParsed,
    parserError,
    jsfError,
    validationFailed,
    redirectDetected,
    updateCount,
    insertCount,
    deleteCount,
    viewStatePresent,
    updatedComponents
  }
}

/**
 * Compare SAX result against production-identical DOMParser protocol facts on the exact same XML.
 * Confirms consistency without creating business side effects.
 */
export function compareJsfDualParsers(xmlText) {
  const saxResult = parseJsfProtocol(xmlText)
  const domResult = extractHttpProtocolFacts(xmlText)

  const consistent =
    saxResult.xmlParsed === domResult.xmlParsed &&
    saxResult.parserError === domResult.parserError &&
    saxResult.jsfError === domResult.jsfError &&
    saxResult.validationFailed === domResult.validationFailed &&
    saxResult.redirectDetected === domResult.redirectDetected &&
    saxResult.updateCount === domResult.updateCount &&
    saxResult.insertCount === domResult.insertCount &&
    saxResult.deleteCount === domResult.deleteCount &&
    saxResult.viewState.present === domResult.viewStatePresent

  return { consistent, saxResult, domResult }
}
