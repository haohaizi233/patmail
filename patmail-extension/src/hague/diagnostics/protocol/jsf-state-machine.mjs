const DEFAULT_MAX_CONTEXTS = 128
const DEFAULT_MAX_INFLIGHT = 1024
const DEFAULT_MAX_INFLIGHT_PER_DOC = 64
const DEFAULT_TTL_MS = 60000

function contextScopeKey(scope) {
  if (!scope || typeof scope.sessionId !== 'string' || !scope.sessionId || typeof scope.frameId !== 'string' || !scope.frameId) {
    return null
  }
  const target = scope.targetId ? `:${scope.targetId}` : ''
  return `${scope.sessionId}${target}:${scope.frameId}`
}

function fullDocumentKey(scope) {
  const base = contextScopeKey(scope)
  if (!base) return null
  const loader = scope.loaderId || 'default'
  const form = scope.formId ? `:${scope.formId}` : ''
  return `${base}:${loader}${form}`
}

export function createViewStateStateMachine(options = {}) {
  const maxContexts = options.maxContexts ?? DEFAULT_MAX_CONTEXTS
  const maxInFlight = options.maxInFlight ?? DEFAULT_MAX_INFLIGHT
  const maxInFlightPerDoc = options.maxInFlightPerDoc ?? DEFAULT_MAX_INFLIGHT_PER_DOC
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS

  let secret = globalThis.crypto.getRandomValues(new Uint8Array(32))
  let generation = 0
  let dispatchCounter = 0

  function ensureSecret() {
    if (!secret) {
      secret = globalThis.crypto.getRandomValues(new Uint8Array(32))
    }
    return secret
  }

  // Maps fullDocumentKey -> { status, lastLoaderId, lastTag, sequence, tagHistory: Uint8Array[], generation, latestCommittedDispatchOrder, updatedAt }
  const documentStates = new Map()
  // Maps `${fullDocKey}:${requestId}` -> { scope, requestId, preTag, requestedAt, dispatchOrder, generation }
  const inFlight = new Map()

  async function computeHmacTag(value) {
    if (typeof value !== 'string' || !value) return null
    try {
      const activeKeyBytes = ensureSecret()
      const key = await globalThis.crypto.subtle.importKey(
        'raw',
        activeKeyBytes,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      )
      const buffer = new TextEncoder().encode(value)
      const sig = await globalThis.crypto.subtle.sign('HMAC', key, buffer)
      return new Uint8Array(sig)
    } catch {
      return null
    }
  }

  function tagsEqual(a, b) {
    if (!a || !b || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false
    }
    return true
  }

  function pruneInFlight(now = Date.now()) {
    for (const [key, item] of inFlight.entries()) {
      if (item.generation !== generation || now - item.requestedAt > ttlMs || now < item.requestedAt) {
        inFlight.delete(key)
      }
    }
    while (inFlight.size > maxInFlight) {
      inFlight.delete(inFlight.keys().next().value)
    }
  }

  function pruneOldest() {
    while (documentStates.size > maxContexts) {
      const oldestKey = documentStates.keys().next().value
      documentStates.delete(oldestKey)
      // Also clean up any inFlight for this doc
      for (const [k] of inFlight.entries()) {
        if (k.startsWith(oldestKey + ':')) {
          inFlight.delete(k)
        }
      }
    }
  }

  return {
    prune(now = Date.now()) {
      pruneInFlight(now)
      pruneOldest()
    },

    getState(scope) {
      const baseKey = contextScopeKey(scope)
      if (!baseKey) return 'STATE_UNVERIFIABLE'
      const docKey = fullDocumentKey(scope)
      const doc = documentStates.get(docKey)

      if (!doc) {
        // Check if there is an existing document for this frame with different loaderId
        for (const [k, d] of documentStates.entries()) {
          if (k.startsWith(baseKey + ':') && d.lastLoaderId && d.lastLoaderId !== scope.loaderId) {
            return 'DOCUMENT_CHANGED'
          }
        }
        return 'UNKNOWN'
      }

      return doc.status
    },

    async recordInitialViewState(scope, initialToken) {
      const baseKey = contextScopeKey(scope)
      if (!baseKey) return { status: 'STATE_UNVERIFIABLE' }
      const docKey = fullDocumentKey(scope)
      const tag = await computeHmacTag(initialToken)

      const doc = {
        status: 'INITIAL_OBSERVED',
        lastLoaderId: scope.loaderId,
        lastTag: tag,
        tagHistory: tag ? [tag] : [],
        sequence: 1,
        latestCommittedDispatchOrder: 0,
        generation,
        updatedAt: Date.now()
      }

      documentStates.set(docKey, doc)
      pruneOldest()
      return { status: 'INITIAL_OBSERVED' }
    },

    beginRequest(scope, requestId) {
      const baseKey = contextScopeKey(scope)
      if (!baseKey) return { status: 'STATE_UNVERIFIABLE' }
      pruneInFlight()

      const docKey = fullDocumentKey(scope)
      let doc = documentStates.get(docKey)

      if (!doc) {
        doc = {
          status: 'REQUEST_IN_FLIGHT',
          lastLoaderId: scope.loaderId,
          lastTag: null,
          tagHistory: [],
          sequence: 0,
          latestCommittedDispatchOrder: 0,
          generation,
          updatedAt: Date.now()
        }
        documentStates.set(docKey, doc)
        pruneOldest()
      } else {
        doc.status = 'REQUEST_IN_FLIGHT'
        doc.updatedAt = Date.now()
      }

      if (requestId) {
        // Enforce per-document in-flight cap
        let docCount = 0
        const docPrefix = `${docKey}:`
        const docKeys = []
        for (const k of inFlight.keys()) {
          if (k.startsWith(docPrefix)) {
            docCount++
            docKeys.push(k)
          }
        }
        while (docCount >= maxInFlightPerDoc && docKeys.length) {
          inFlight.delete(docKeys.shift())
          docCount--
        }

        dispatchCounter++
        inFlight.set(`${docKey}:${requestId}`, {
          scope,
          requestId,
          preTag: doc.lastTag,
          requestedAt: Date.now(),
          dispatchOrder: dispatchCounter,
          generation
        })
      }

      return { status: 'REQUEST_IN_FLIGHT' }
    },

    async recordResponseViewState(scope, requestId, newViewState) {
      const baseKey = contextScopeKey(scope)
      if (!baseKey) return { status: 'STATE_UNVERIFIABLE', transition: 'STATE_UNVERIFIABLE' }
      pruneInFlight()

      const docKey = fullDocumentKey(scope)
      const doc = documentStates.get(docKey)

      if (!doc) {
        return { status: 'STATE_UNVERIFIABLE', transition: 'STATE_UNVERIFIABLE' }
      }

      if (newViewState === null || newViewState === undefined || newViewState === '') {
        doc.status = 'STATE_MISSING'
        if (requestId) inFlight.delete(`${docKey}:${requestId}`)
        return { status: 'STATE_MISSING', transition: 'STATE_MISSING' }
      }

      const activeGen = generation
      const newTag = await computeHmacTag(newViewState)
      if (activeGen !== generation || !secret) {
        return { status: 'STATE_UNVERIFIABLE', transition: 'STATE_UNVERIFIABLE' }
      }

      const inFlightKey = requestId ? `${docKey}:${requestId}` : null
      const reqInfo = inFlightKey ? inFlight.get(inFlightKey) : null
      if (inFlightKey) inFlight.delete(inFlightKey)

      // Section 3.4: First observation semantics
      // If no initial ViewState baseline was previously observed for this document:
      if (!doc.lastTag && (!doc.tagHistory || doc.tagHistory.length === 0)) {
        doc.lastTag = newTag
        doc.tagHistory = [newTag]
        doc.sequence = 1
        doc.status = 'INITIAL_OBSERVED'
        doc.latestCommittedDispatchOrder = reqInfo?.dispatchOrder ?? 0
        doc.updatedAt = Date.now()
        return {
          status: 'INITIAL_OBSERVED',
          transition: 'INITIAL_OBSERVED'
        }
      }

      // Check against current latest tag
      if (doc.lastTag && tagsEqual(doc.lastTag, newTag)) {
        doc.status = 'STATE_UNCHANGED'
        doc.sequence++
        if (reqInfo && reqInfo.dispatchOrder > (doc.latestCommittedDispatchOrder ?? 0)) {
          doc.latestCommittedDispatchOrder = reqInfo.dispatchOrder
        }
        doc.updatedAt = Date.now()
        return { status: 'STATE_UNCHANGED', transition: 'STATE_UNCHANGED' }
      }

      // Check if this tag returned is in older history -> out-of-order regression
      if (doc.tagHistory && doc.tagHistory.some(t => tagsEqual(t, newTag))) {
        doc.sequence++
        doc.updatedAt = Date.now()
        return { status: 'OUT_OF_ORDER', transition: 'OUT_OF_ORDER' }
      }

      // Check against this request's own preTag (if not an older historical tag)
      if (reqInfo && reqInfo.preTag && tagsEqual(reqInfo.preTag, newTag)) {
        doc.status = 'STATE_UNCHANGED'
        doc.sequence++
        doc.updatedAt = Date.now()
        return { status: 'STATE_UNCHANGED', transition: 'STATE_UNCHANGED' }
      }

      // If inFlight record was missing or evicted, and state has progressed:
      if (!reqInfo && requestId) {
        doc.sequence++
        doc.updatedAt = Date.now()
        return { status: 'STATE_UNVERIFIABLE', transition: 'STATE_UNVERIFIABLE' }
      }

      // Concurrent request evaluation:
      // If this request started from an older preTag, and an intervening request already advanced the state:
      if (reqInfo && reqInfo.preTag && !tagsEqual(reqInfo.preTag, doc.lastTag)) {
        // If this request was dispatched before the latest committed request, and returns an unknown state:
        if (reqInfo.dispatchOrder < (doc.latestCommittedDispatchOrder ?? 0)) {
          doc.sequence++
          doc.status = 'STATE_CONFLICT'
          doc.updatedAt = Date.now()
          return { status: 'STATE_CONFLICT', transition: 'STATE_CONFLICT' }
        }
      }

      // Normal valid state advance
      doc.lastTag = newTag
      if (!doc.tagHistory) doc.tagHistory = []
      doc.tagHistory.push(newTag)
      if (doc.tagHistory.length > 20) doc.tagHistory.shift()
      doc.sequence++
      doc.status = 'STATE_CHANGED'
      doc.latestCommittedDispatchOrder = Math.max(doc.latestCommittedDispatchOrder ?? 0, reqInfo?.dispatchOrder ?? 0)
      doc.updatedAt = Date.now()

      return {
        status: 'STATE_CHANGED',
        transition: 'STATE_CHANGED'
      }
    },

    invalidateDocument(scope) {
      const docKey = fullDocumentKey(scope)
      if (docKey) {
        documentStates.delete(docKey)
        const prefix = `${docKey}:`
        for (const k of inFlight.keys()) {
          if (k.startsWith(prefix)) inFlight.delete(k)
        }
      }
    },

    invalidateSession(sessionId) {
      if (!sessionId) return
      for (const [k] of documentStates.entries()) {
        if (k.startsWith(sessionId + ':')) {
          documentStates.delete(k)
        }
      }
      for (const [k] of inFlight.entries()) {
        if (k.startsWith(sessionId + ':')) {
          inFlight.delete(k)
        }
      }
    },

    forgetRequest(scope, requestId) {
      if (!requestId) return
      const docKey = fullDocumentKey(scope)
      if (docKey) {
        inFlight.delete(`${docKey}:${requestId}`)
      } else {
        // Fallback search across all inFlight
        for (const k of inFlight.keys()) {
          if (k.endsWith(`:${requestId}`)) {
            inFlight.delete(k)
          }
        }
      }
    },

    getDiagnosticsSnapshot(scope) {
      const docKey = scope ? fullDocumentKey(scope) : null
      const doc = docKey ? documentStates.get(docKey) : null
      return {
        hasActiveKey: !!secret && secret.some(b => b !== 0),
        status: doc ? doc.status : 'UNKNOWN',
        inFlightCount: inFlight.size,
        contextsCount: documentStates.size,
        generation
      }
    },

    clear() {
      generation++
      documentStates.clear()
      inFlight.clear()
      if (secret) {
        secret.fill(0)
        secret = null
      }
    }
  }
}
