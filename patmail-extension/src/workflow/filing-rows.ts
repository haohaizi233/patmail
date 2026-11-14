import type { FilingExportRow } from '../api/filing-export'
import { recallRecovery, rememberRecovery } from '../recovery/wal-ledger'
import { yieldToMain } from '../utils/idle'

/**
 * 递交导出行档：几万件的导出行不进渲染管线，先记进恢复账本，翻页才把那几行拿出来算渲染。
 * 取数是并行乱序的，行按件入档、按片（200 件）落账本。同一批件重新导出时装回旧档，
 * 取过的件不再打接口——取数中断了也是接着取没取到的，不是从头再来。
 */

/** 一片记多少件。片小写得勤、续传丢得少；片大一笔账本大。200 件在两边都够用。 */
export const FILING_ROWS_SHARD = 200

/** 行档在恢复账本里的槽位，和工作面、查询结果一个待遇：掉了按槽位装回去。 */
const SLOT = 'filing-export'
const PREFIX = 'filing-rows'
const META_SCOPE = `${PREFIX}|meta`

/** 账本里一片的形状：这一片每件的编号和行，没取到的件是 null。 */
interface FilingRowsShard {
  version: 1
  batchKey: string
  entries: { id: string; lines: FilingExportRow[] | null }[]
}

/** 账本里的片数记号：这一批件写到第几片。 */
interface FilingRowsMeta {
  version: 1
  batchKey: string
  shards: number
}

/** 行档的落账本接口。默认走恢复账本，测试可以换成内存的。 */
export interface FilingRowsStore {
  remember(scope: string, payload: unknown): Promise<void>
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- 存量豁免：保留显式联合类型以固定契约
  recall(scope: string): Promise<unknown | null>
}

const recoveryRowsStore: FilingRowsStore = {
  remember: (scope, payload) => rememberRecovery(SLOT, scope, payload),
  recall: scope => recallRecovery(SLOT, scope)
}

function shardScope(shard: number): string {
  return `${PREFIX}|${shard}`
}

function readShard(value: unknown): FilingRowsShard | null {
  if (!value || typeof value !== 'object') return null
  const shard = value as Partial<FilingRowsShard>
  if (shard.version !== 1 || typeof shard.batchKey !== 'string' || !Array.isArray(shard.entries)) return null
  return shard as FilingRowsShard
}

function readMeta(value: unknown): FilingRowsMeta | null {
  if (!value || typeof value !== 'object') return null
  const meta = value as Partial<FilingRowsMeta>
  if (meta.version !== 1 || typeof meta.batchKey !== 'string' || !Number.isInteger(meta.shards)) return null
  return meta as FilingRowsMeta
}

function hashOf(text: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** 批次指纹：件数加逐件编号的散列。并行取数到件顺序每次不同，指纹不能跟顺序有关。 */
export function filingRowsBatchKey(rows: readonly { filingId: string; caseVolume: string }[]): string {
  if (!rows.length) return 'empty'
  let sum = 0
  for (const row of rows) sum = (sum + hashOf(row.filingId || row.caseVolume)) >>> 0
  return `${rows.length}-${sum.toString(36)}`
}

/** 一批件的导出行档：内存一份供翻页取行，账本一份供续传。 */
export class FilingRowsLedger {
  /** 按件下标放这一件的导出行；还没取到的是 undefined。普通数组，不进响应式。 */
  private readonly slots: Array<FilingExportRow[] | undefined>
  private readonly ids: string[]
  private readonly indexById = new Map<string, number>()
  /** 落账本还没写完的片号。 */
  private readonly dirty = new Set<number>()
  private total = 0
  private shards = 0
  private metaDirty = false
  private chain: Promise<void> = Promise.resolve()

  constructor(
    readonly batchKey: string,
    filings: readonly { filingId: string; caseVolume: string }[],
    private readonly store: FilingRowsStore = recoveryRowsStore
  ) {
    this.ids = filings.map(row => row.filingId || row.caseVolume)
    this.slots = filings.map(() => undefined)
    this.ids.forEach((id, index) => {
      if (!this.indexById.has(id)) this.indexById.set(id, index)
    })
  }

  /** 一件的行入档：进内存等翻页取，标脏等落账本。同一件同一批行重复入档不动。 */
  put(index: number, lines: FilingExportRow[]): void {
    if (index < 0 || index >= this.slots.length) return
    const previous = this.slots[index]
    if (previous === lines) return
    if (previous) this.total -= previous.length
    this.slots[index] = lines
    this.total += lines.length
    const shard = Math.floor(index / FILING_ROWS_SHARD)
    this.dirty.add(shard)
    if (shard >= this.shards) {
      this.shards = shard + 1
      this.metaDirty = true
    }
  }

  /** 这件取过且有行就给行。断点续传按这个跳过已取的件；没取到的（含失败的空行）会重取。 */
  filled(index: number): FilingExportRow[] | undefined {
    const lines = this.slots[index]
    return lines && lines.length ? lines : undefined
  }

  /** 总导出行数。增量维护，不摊平全量。 */
  get lineCount(): number {
    return this.total
  }

  /** 翻页才取行：按全局行序切 [from, from + size)，没翻到的页不算不渲染。 */
  page(from: number, size: number): Array<{ key: string; row: FilingExportRow }> {
    const out: Array<{ key: string; row: FilingExportRow }> = []
    if (size <= 0 || from < 0) return out
    let seen = 0
    for (let index = 0; index < this.slots.length && out.length < size; index += 1) {
      const lines = this.slots[index]
      if (!lines) continue
      for (let order = 0; order < lines.length; order += 1) {
        if (seen >= from) out.push({ key: `${index}-${order}`, row: lines[order] })
        seen += 1
        if (out.length >= size) return out
      }
    }
    return out
  }

  /** 导出那一下才摊平全量，渲染循环里不碰这个。 */
  all(): FilingExportRow[] {
    const out: FilingExportRow[] = []
    for (const lines of this.slots) {
      for (const line of lines ?? []) out.push(line)
    }
    return out
  }

  /** 脏片落账本。写一次账本要整库导出落盘，所以攒着成片写，不按件写。 */
  flush(): Promise<void> {
    this.chain = this.chain.then(() => this.drain())
    return this.chain
  }

  private async drain(): Promise<void> {
    for (;;) {
      const next = this.dirty.values().next()
      if (next.done) break
      const shard = next.value
      this.dirty.delete(shard)
      try {
        await this.store.remember(shardScope(shard), this.shardPayload(shard))
      } catch {
        this.dirty.add(shard)
        return
      }
    }
    if (!this.metaDirty) return
    this.metaDirty = false
    try {
      await this.store.remember(META_SCOPE, { version: 1, batchKey: this.batchKey, shards: this.shards } satisfies FilingRowsMeta)
    } catch {
      this.metaDirty = true
    }
  }

  private shardPayload(shard: number): FilingRowsShard {
    const from = shard * FILING_ROWS_SHARD
    const to = Math.min(from + FILING_ROWS_SHARD, this.slots.length)
    const entries: { id: string; lines: FilingExportRow[] | null }[] = []
    for (let index = from; index < to; index += 1) {
      entries.push({ id: this.ids[index], lines: this.slots[index] ?? null })
    }
    return { version: 1, batchKey: this.batchKey, entries }
  }

  /** 同一批件装回旧档：指纹对得上才认，装回的件不再打接口。返回装回多少件。 */
  async restore(): Promise<number> {
    let meta: FilingRowsMeta | null = null
    try {
      meta = readMeta(await this.store.recall(META_SCOPE))
    } catch {
      return 0
    }
    if (!meta || meta.batchKey !== this.batchKey) return 0
    let filled = 0
    for (let shard = 0; shard < meta.shards; shard += 1) {
      // 装档是一口气的活，每装完一片让一让主线程，别把启动那一瞬堵死。
      if (shard) await yieldToMain()
      let saved: FilingRowsShard | null = null
      try {
        saved = readShard(await this.store.recall(shardScope(shard)))
      } catch {
        continue
      }
      if (!saved || saved.batchKey !== this.batchKey) continue
      for (const entry of saved.entries) {
        if (!entry || typeof entry.id !== 'string' || !Array.isArray(entry.lines) || !entry.lines.length) continue
        const index = this.indexById.get(entry.id)
        if (index === undefined || this.slots[index]) continue
        this.slots[index] = entry.lines
        this.total += entry.lines.length
        filled += 1
      }
    }
    return filled
  }
}
