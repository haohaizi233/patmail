import { Worker } from 'node:worker_threads'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL, URL } from 'node:url'
import { SCRIPTS_ROOT } from '../../shared/paths.mjs'

const DEFAULT_WORKER_URL = pathToFileURL(join(SCRIPTS_ROOT, 'hague', 'research', 'hague-research-worker.mjs'))

export class AnalysisWorker {
  constructor({ timeoutMs = 1500, workerUrl = DEFAULT_WORKER_URL } = {}) {
    Object.assign(this, { timeoutMs, workerUrl })
    this.reserved = 0
    this.pending = new Map()
    this.serial = 0
    this.worker = null
    this.stats = {
      queuedAnalyses: 0,
      peakQueuedAnalyses: 0,
      astDurationMs: 0,
      xmlDurationMs: 0,
      correlationDurationMs: 0,
      timeouts: 0,
      droppedDiagnostics: 0,
      analyzedScripts: 0,
      astCalls: 0,
      parsedResponses: 0,
      workerHeapBytes: 0,
      processRssBytes: process.memoryUsage().rss,
      peakRssBytes: process.memoryUsage().rss
    }
  }

  resetMetrics() {
    for (const key of Object.keys(this.stats)) this.stats[key] = 0
    this.sample()
    this.stats.peakRssBytes = this.stats.processRssBytes
  }

  capacity() {
    return 64 - this.pending.size - this.reserved
  }

  reserve() {
    if (this.capacity() < 1) return false
    this.reserved++
    return true
  }

  release() {
    this.reserved = Math.max(0, this.reserved - 1)
  }

  sample() {
    const rss = process.memoryUsage().rss
    this.stats.processRssBytes = rss
    this.stats.peakRssBytes = Math.max(this.stats.peakRssBytes, rss)
    this.stats.queuedAnalyses = this.pending.size
    return { ...this.stats }
  }

  ensureWorker() {
    if (this.worker) return this.worker
    if (this.workerUrl instanceof URL && this.workerUrl.protocol === 'file:' && !existsSync(this.workerUrl)) {
      throw Object.assign(Error('analysis worker file is missing'), { code: 'analysis_error' })
    }
    this.worker = new Worker(this.workerUrl, { resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16 } })
    const instance = this.worker
    this.worker.on('message', ({ id, result, error, metrics }) => {
      if (this.worker !== instance) return
      const p = this.pending.get(id)
      if (!p) return
      clearTimeout(p.timer)
      this.pending.delete(id)
      if (metrics) {
        this.stats[`${p.kind === 'ast' ? 'ast' : p.kind === 'xml' ? 'xml' : 'correlation'}DurationMs`] += metrics.durationMs
        this.stats.workerHeapBytes = metrics.heapBytes
      }
      if (!error && p.kind === 'ast') {
        this.stats.analyzedScripts++
        this.stats.astCalls += result.calls?.length ?? 0
      }
      if (!error && p.kind === 'xml' && result.xmlParsed) this.stats.parsedResponses++
      error ? p.reject(Error('analysis failed')) : p.resolve(result)
      this.sample()
      this.onCapacity?.()
    })
    this.worker.on('exit', () => {
      if (this.worker === instance) {
        this.stats.droppedDiagnostics += this.pending.size
        this.clear('analysis_error')
        this.onCapacity?.()
      }
    })
    this.worker.on('error', () => {
      if (this.worker === instance) {
        this.stats.droppedDiagnostics += this.pending.size
        this.clear()
        this.onCapacity?.()
      }
    })
    return this.worker
  }

  signal(action, payload) {
    try {
      const w = this.ensureWorker()
      w.postMessage({ type: 'signal', action, payload })
    } catch {
      // Background lifecycle notifications are fail-silent
    }
  }

  async analyze(kind, value, options = {}) {
    if (!this.capacity()) {
      this.stats.droppedDiagnostics++
      return Promise.reject(Object.assign(Error('analysis queue full'), { code: 'queue_limit' }))
    }
    try {
      this.ensureWorker()
    } catch (error) {
      this.stats.droppedDiagnostics++
      if (error?.code === 'analysis_error') throw error
      throw Object.assign(Error('analysis worker unavailable'), { code: 'analysis_error' })
    }
    const result = await new Promise((resolve, reject) => {
      const id = ++this.serial
      const timer = setTimeout(() => {
        this.stats.timeouts++
        this.stats.droppedDiagnostics += this.pending.size
        this.clear('time_limit')
        this.onCapacity?.()
      }, this.timeoutMs)
      this.pending.set(id, { resolve, reject, timer, kind })
      this.sample()
      this.stats.peakQueuedAnalyses = Math.max(this.stats.peakQueuedAnalyses, this.pending.size)
      try {
        this.worker.postMessage({ id, kind, value, options })
      } catch {
        clearTimeout(timer)
        this.pending.delete(id)
        this.stats.droppedDiagnostics++
        this.sample()
        reject(Object.assign(Error('analysis message unavailable'), { code: 'analysis_error' }))
        queueMicrotask(() => this.onCapacity?.())
      }
    })
    return result
  }

  clear(code = 'disabled') {
    const worker = this.worker
    this.worker = null
    for (const p of this.pending.values()) {
      clearTimeout(p.timer)
      p.reject(Object.assign(Error('analysis cancelled'), { code }))
    }
    this.pending.clear()
    this.reserved = 0
    this.sample()
    void worker?.terminate()
  }
}
