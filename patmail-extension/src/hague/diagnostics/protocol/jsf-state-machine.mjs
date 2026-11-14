const MAX_CONTEXTS = 128

function contextScopeKey(scope) {
  if (!scope || !scope.sessionId || !scope.frameId) return null
  return `${scope.sessionId}:${scope.frameId}`
}

function fullDocumentKey(scope) {
  const base = contextScopeKey(scope)
  if (!base) return null
  const loader = scope.loaderId || 'default'
  return `${base}:${loader}`
}

export function createViewStateStateMachine() {
  let secret = globalThis.crypto.getRandomValues(new Uint8Array(32))
  let generation = 0

  function ensureSecret() {
    if (!secret) {
      secret = globalThis.crypto.getRandomValues(new Uint8Array(32))
    }
    return secret
  }

  // Maps fullDocumentKey -> { status, lastLoaderId, lastTag, sequence, tagHistory: Uint8Array[], generation }
  const documentStates = new Map()
  // Maps `${fullDocKey}:${requestId}` -> { preTag, requestedAt }
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

  function pruneOldest() {
    while (documentStates.size > MAX_CONTEXTS) {
      documentStates.delete(documentStates.keys().next().value)
    }
  }

  return {
    getState(scope) {
      const baseKey = contextScopeKey(scope)
      if (!baseKey) return 'STATE_UNVERIFIABLE'
      const docKey = fullDocumentKey(scope)
      const doc = documentStates.get(docKey)

      if (!doc) {
        // Check if there is an existing document for this frame with different loaderId
        for (const [k, d] of documentStates.entries()) {
          if (k.startsWith(baseKey + ':') && d.lastLoaderId !== scope.loaderId) {
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
        generation
      }

      documentStates.set(docKey, doc)
      pruneOldest()
      return { status: 'INITIAL_OBSERVED' }
    },

    beginRequest(scope, requestId) {
      const baseKey = contextScopeKey(scope)
      if (!baseKey) return { status: 'STATE_UNVERIFIABLE' }
      const docKey = fullDocumentKey(scope)
      let doc = documentStates.get(docKey)

      if (!doc) {
        doc = {
          status: 'REQUEST_IN_FLIGHT',
          lastLoaderId: scope.loaderId,
          lastTag: null,
          tagHistory: [],
          sequence: 1,
          generation
        }
        documentStates.set(docKey, doc)
      } else {
        doc.status = 'REQUEST_IN_FLIGHT'
      }

      if (requestId) {
        inFlight.set(`${docKey}:${requestId}`, {
          preTag: doc.lastTag,
          requestedAt: Date.now()
        })
      }

      return { status: 'REQUEST_IN_FLIGHT' }
    },

    async recordResponseViewState(scope, requestId, newViewState) {
      const baseKey = contextScopeKey(scope)
      if (!baseKey) return { status: 'STATE_UNVERIFIABLE', transition: 'STATE_UNVERIFIABLE' }
      const docKey = fullDocumentKey(scope)
      const doc = documentStates.get(docKey)

      if (!doc) {
        return { status: 'STATE_UNVERIFIABLE', transition: 'STATE_UNVERIFIABLE' }
      }

      if (newViewState === null || newViewState === undefined || newViewState === '') {
        doc.status = 'STATE_MISSING'
        return { status: 'STATE_MISSING', transition: 'STATE_MISSING' }
      }

      const activeGen = generation
      const newTag = await computeHmacTag(newViewState)
      if (activeGen !== generation) {
        return { status: 'STATE_UNVERIFIABLE', transition: 'STATE_UNVERIFIABLE' }
      }

      const reqInfo = requestId ? inFlight.get(`${docKey}:${requestId}`) : null
      if (requestId) inFlight.delete(`${docKey}:${requestId}`)

      let transition = 'STATE_CHANGED'
      if (doc.lastTag && tagsEqual(doc.lastTag, newTag)) {
        transition = 'STATE_UNCHANGED'
      } else if (reqInfo && reqInfo.preTag && tagsEqual(reqInfo.preTag, newTag)) {
        transition = 'STATE_UNCHANGED'
      } else if (doc.tagHistory && doc.tagHistory.some(t => tagsEqual(t, newTag))) {
        // Older tag in history returning later than a newer tag
        transition = 'OUT_OF_ORDER'
      }

      if (transition !== 'OUT_OF_ORDER') {
        doc.lastTag = newTag
        if (!doc.tagHistory) doc.tagHistory = []
        doc.tagHistory.push(newTag)
        if (doc.tagHistory.length > 20) doc.tagHistory.shift()
      }
      doc.sequence++
      doc.status = transition === 'STATE_UNCHANGED' ? 'STATE_UNCHANGED' : 'STATE_CHANGED'

      return {
        status: doc.status,
        transition
      }
    },

    getDiagnosticsSnapshot(scope) {
      const baseKey = contextScopeKey(scope)
      const docKey = fullDocumentKey(scope)
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
