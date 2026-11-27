import initSqlJs, { type SqlStatic } from 'sql.js'
import { createRecoveryClient } from './client'

type SqlDatabase = InstanceType<SqlStatic['Database']>
import wasmAsset from 'sql.js/dist/sql-wasm.wasm?url'

/** 工作面、查询结果、发文账本、流程执行记录、递交导出行档。登录掉了也按这个槽位装回去。 */
export type RecoverySlot = 'workflow-desk' | 'billing-desk' | 'limit-query' | 'limit-mail' | 'limit-mail-intent' | 'file-mail' | 'file-desk' | 'workflow-exec' | 'workflow-write' | 'mail-exec' | 'filing-export' | 'file-query'

export interface StoredFrame {
  seq: number
  slot: RecoverySlot
  scope: string
  payload: string
  at: string
}

export interface RecoveryStore {
  readCheckpoint(): Promise<Uint8Array | null>
  writeCheckpoint(bytes: Uint8Array): Promise<void>
  commitCheckpoint?(bytes: Uint8Array, through: number): Promise<void>
  appendFrame(frame: StoredFrame): Promise<void>
  readFrames(): Promise<StoredFrame[]>
  dropFramesThrough(seq: number): Promise<void>
}

export interface RecoveryHead {
  scope: string
  payload: unknown
  at: string
  revision?: number
}

const SLOTS = new Set<RecoverySlot>(['workflow-desk', 'billing-desk', 'limit-query', 'limit-mail', 'limit-mail-intent', 'file-mail', 'file-desk', 'workflow-exec', 'workflow-write', 'mail-exec', 'filing-export', 'file-query'])

/** 两个系统各留一份。origin 用站点地址，leaf 是页面里的槽。 */
export function systemScope(origin: string, leaf: string): string {
  const base = origin.trim().replace(/\/+$/, '').toLowerCase() || 'local'
  const scope = `${base}|${leaf}`
  return scope.length > 200 ? scope.slice(0, 200) : scope
}
const SECRET = /^(cookie|authorization|password|set-cookie)$/i

let wasmOverride: ArrayBuffer | null = null
let engine: Promise<SqlStatic> | null = null

/** 测试直接交给 wasm 字节，避免再去拉文件。 */
export function useRecoveryWasm(bytes: ArrayBuffer): void {
  wasmOverride = bytes
  engine = null
}

async function wasmBinary(): Promise<ArrayBuffer> {
  if (wasmOverride) return wasmOverride
  const response = await fetch(wasmAsset)
  if (!response.ok) throw new Error('恢复账本组件没有载入。')
  return response.arrayBuffer()
}

function sqlEngine(): Promise<SqlStatic> {
  engine ??= wasmBinary().then(binary => initSqlJs({ wasmBinary: binary }))
  return engine
}

export function isSlot(value: string): value is RecoverySlot {
  return SLOTS.has(value as RecoverySlot)
}

function hasSecret(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  if (Array.isArray(value)) return value.some(item => hasSecret(item))
  return Object.entries(value).some(([key, item]) => SECRET.test(key) || hasSecret(item))
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function cell(row: unknown[], columns: string[], name: string): unknown {
  return row[columns.indexOf(name)]
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

export function memoryRecoveryStore(): RecoveryStore {
  let checkpoint: Uint8Array | null = null
  const frames: StoredFrame[] = []
  return {
    // eslint-disable-next-line @typescript-eslint/require-await -- 存量豁免：保留 async 接口契约（Promise 返回）
    async readCheckpoint() {
      return checkpoint ? checkpoint.slice() : null
    },
    // eslint-disable-next-line @typescript-eslint/require-await -- 存量豁免：保留 async 接口契约（Promise 返回）
    async writeCheckpoint(bytes) {
      checkpoint = bytes.slice()
    },
    // eslint-disable-next-line @typescript-eslint/require-await -- 存量豁免：保留 async 接口契约（Promise 返回）
    async appendFrame(frame) {
      frames.push({ ...frame })
    },
    // eslint-disable-next-line @typescript-eslint/require-await -- 存量豁免：保留 async 接口契约（Promise 返回）
    async readFrames() {
      return frames.map(item => ({ ...item }))
    },
    // eslint-disable-next-line @typescript-eslint/require-await -- 存量豁免：保留 async 接口契约（Promise 返回）
    async dropFramesThrough(seq) {
      for (let index = frames.length - 1; index >= 0; index -= 1) {
        if (frames[index].seq <= seq) frames.splice(index, 1)
      }
    }
  }
}

const DB_NAME = 'patmail-recovery'
const CHECKPOINT = 'checkpoint'
const WAL = 'wal'
const CHECKPOINT_KEY = 'db'

/** 扩展自己的 IndexedDB。页面和后台共用这一份，不放在原站页面里。 */
export function indexedRecoveryStore(factory: IDBFactory | undefined = globalThis.indexedDB): RecoveryStore | null {
  if (!factory) return null
  let opened: Promise<IDBDatabase> | null = null
  const open = (): Promise<IDBDatabase> => {
    opened ??= new Promise((resolve, reject) => {
      const request = factory.open(DB_NAME, 1)
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(CHECKPOINT)) database.createObjectStore(CHECKPOINT)
        if (!database.objectStoreNames.contains(WAL)) database.createObjectStore(WAL)
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('恢复账本没有打开。'))
    })
    return opened
  }
  async function transaction<T>(names: string | string[], mode: IDBTransactionMode, work: (tx: IDBTransaction, result: (value: T) => void) => void): Promise<T> {
    const database = await open()
    return new Promise<T>((resolve, reject) => {
      const tx = database.transaction(names, mode)
      let value: T
      tx.oncomplete = () => resolve(value)
      tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('恢复账本事务未提交。'))
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- 存量豁免：保留原始 rejection reason（AbortSignal/DOMException）
      try { work(tx, next => { value = next }) } catch (error) { tx.abort(); reject(error) }
    })
  }
  function removeThrough(tx: IDBTransaction, through: number): void {
    const request = tx.objectStore(WAL).openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return
      if (typeof cursor.key === 'number' && cursor.key <= through) cursor.delete()
      cursor.continue()
    }
  }
  return {
    readCheckpoint: () => transaction<Uint8Array | null>(CHECKPOINT, 'readonly', (tx, result) => {
      const request = tx.objectStore(CHECKPOINT).get(CHECKPOINT_KEY)
      request.onsuccess = () => result(request.result instanceof Uint8Array ? request.result : null)
    }),
    writeCheckpoint: bytes => transaction<void>(CHECKPOINT, 'readwrite', tx => { tx.objectStore(CHECKPOINT).put(bytes, CHECKPOINT_KEY) }),
    commitCheckpoint: (bytes, through) => transaction<void>([CHECKPOINT, WAL], 'readwrite', tx => {
      tx.objectStore(CHECKPOINT).put(bytes, CHECKPOINT_KEY)
      removeThrough(tx, through)
    }),
    appendFrame: frame => transaction<void>(WAL, 'readwrite', tx => { tx.objectStore(WAL).add(frame, frame.seq) }),
    readFrames: () => transaction<StoredFrame[]>(WAL, 'readonly', (tx, result) => {
      const request = tx.objectStore(WAL).getAll()
      request.onsuccess = () => result((request.result as StoredFrame[]).filter(frame =>
        Number.isSafeInteger(frame?.seq) && isSlot(frame.slot) && typeof frame.scope === 'string' && typeof frame.payload === 'string'))
    }),
    dropFramesThrough: seq => transaction<void>(WAL, 'readwrite', tx => removeThrough(tx, seq))
  }
}

function schema(db: SqlDatabase): string {
  db.run(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS wal (
      seq INTEGER PRIMARY KEY,
      slot TEXT NOT NULL,
      scope TEXT NOT NULL,
      payload TEXT NOT NULL,
      at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS head (
      slot TEXT NOT NULL,
      scope TEXT NOT NULL,
      seq INTEGER NOT NULL,
      payload TEXT NOT NULL,
      at TEXT NOT NULL,
      PRIMARY KEY (slot, scope)
    )`)
  const mode = db.exec('PRAGMA journal_mode=WAL')
  db.run('PRAGMA synchronous=NORMAL')
  const journal = text(mode[0]?.values[0]?.[0]) || 'memory'
  db.run(`INSERT INTO meta (key, value) VALUES ('journal', ${quote(journal)}) ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
  return journal
}

function maxSeq(db: SqlDatabase): number {
  // 序号同时看暂存的 wal 和已折好的 head：wal 表被清掉之后序号也不能回头，不然新笔压不动旧 head。
  const rows = db.exec('SELECT COALESCE(MAX(seq), 0) AS seq FROM (SELECT seq FROM wal UNION ALL SELECT seq FROM head)')
  const value = rows[0]?.values[0]?.[0]
  return typeof value === 'number' ? value : 0
}

/** 已经折进 head 的行从 wal 表里清掉。这张表只当暂存用，不清的话每笔快照都背着全量历史，越写越大。 */
function compactWal(db: SqlDatabase, through: number): void {
  try { db.run(`DELETE FROM wal WHERE seq <= ${through}`) } catch { /* 清不掉也不影响读写 */ }
}

function applyFrame(db: SqlDatabase, frame: StoredFrame): void {
  db.run('BEGIN IMMEDIATE')
  try {
    db.run(`INSERT OR IGNORE INTO wal (seq, slot, scope, payload, at) VALUES (${frame.seq}, ${quote(frame.slot)}, ${quote(frame.scope)}, ${quote(frame.payload)}, ${quote(frame.at)})`)
    db.run(`INSERT INTO head (slot, scope, seq, payload, at) VALUES (${quote(frame.slot)}, ${quote(frame.scope)}, ${frame.seq}, ${quote(frame.payload)}, ${quote(frame.at)})
      ON CONFLICT(slot, scope) DO UPDATE SET seq=excluded.seq, payload=excluded.payload, at=excluded.at
      WHERE excluded.seq >= head.seq`)
    db.run('COMMIT')
  } catch (error) {
    try { db.run('ROLLBACK') } catch { /* 事务已经结束 */ }
    throw error
  }
}

/** 折库前把 SQLite 自己的 WAL 日志并回主库，导出才是完整的一份。 */
function foldJournal(db: SqlDatabase): void {
  try { db.run('PRAGMA wal_checkpoint(TRUNCATE)') } catch { /* 这一下没折进去，导出时仍是提交后的库 */ }
}

// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- 存量豁免：保留显式联合类型以固定契约
function readPayload(raw: string): unknown | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && (parsed as { forgotten?: unknown }).forgotten === true) return null
    return parsed
  } catch {
    return null
  }
}

/** SQLite 开着 WAL。真正掉电前先把这一笔写进 IndexedDB，再折进库文件。库文件没写完时，下次打开会把那一笔补上。
 * 折库是整库导出（O(库大小)），所以跟着写回合并攒着一把做：帧先落账本兜底，库文件按节拍/批量补上。 */
export class RecoveryLedger {
  private chain: Promise<void> = Promise.resolve()
  /** 已经折进内存库的最后一笔。 */
  private foldedSeq = 0
  /** 已经落进库文件的最后一笔。 */
  private checkpointSeq = 0
  private checkpointTimer: ReturnType<typeof setTimeout> | undefined

  constructor(private readonly store: RecoveryStore, private readonly db: SqlDatabase, readonly journalMode: string) {
    this.foldedSeq = maxSeq(db)
    this.checkpointSeq = this.foldedSeq
  }

  put(slot: RecoverySlot, scope: string, payload: unknown, expectedRevision?: number): Promise<void> {
    return this.enqueue(() => this.write(slot, scope, payload, expectedRevision))
  }

  /** 把攒着的笔一把折进库文件：整库导出只做一次，不跟着每一笔跑。 */
  checkpoint(): Promise<void> {
    return this.enqueue(() => this.fold())
  }

  forget(slot: RecoverySlot, scope: string): Promise<void> {
    return this.put(slot, scope, { forgotten: true })
  }

  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- 存量豁免：保留显式联合类型以固定契约
  async get(slot: RecoverySlot, scope: string): Promise<unknown | null> {
    await this.chain
    const rows = this.db.exec(`SELECT payload FROM head WHERE slot=${quote(slot)} AND scope=${quote(scope)}`)
    const raw = rows[0]?.values[0]?.[0]
    return typeof raw === 'string' ? readPayload(raw) : null
  }

  async latest(slot: RecoverySlot): Promise<RecoveryHead | null> {
    await this.chain
    const table = this.db.exec(`SELECT scope, payload, at, seq FROM head WHERE slot=${quote(slot)} ORDER BY seq DESC`)[0]
    if (!table) return null
    for (const row of table.values) {
      const payload = readPayload(text(cell(row, table.columns, 'payload')))
      if (payload == null) continue
      return { scope: text(cell(row, table.columns, 'scope')), payload, at: text(cell(row, table.columns, 'at')), revision: Number(cell(row, table.columns, 'seq')) }
    }
    return null
  }

  async heads(slot: RecoverySlot): Promise<RecoveryHead[]> {
    await this.chain
    const table = this.db.exec(`SELECT scope, payload, at, seq FROM head WHERE slot=${quote(slot)} ORDER BY seq`)[0]
    if (!table) return []
    return table.values.flatMap(row => {
      const payload = readPayload(text(cell(row, table.columns, 'payload')))
      if (payload == null) return []
      return [{ scope: text(cell(row, table.columns, 'scope')), payload, at: text(cell(row, table.columns, 'at')), revision: Number(cell(row, table.columns, 'seq')) }]
    })
  }

  async revision(slot: RecoverySlot, scope: string): Promise<number> {
    await this.chain
    return this.currentRevision(slot, scope)
  }

  private currentRevision(slot: RecoverySlot, scope: string): number {
    const value = this.db.exec(`SELECT seq FROM head WHERE slot=${quote(slot)} AND scope=${quote(scope)}`)[0]?.values[0]?.[0]
    return typeof value === 'number' ? value : 0
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const run = this.chain.then(work, work)
    this.chain = run.then(() => undefined, () => undefined)
    return run
  }

  private async write(slot: RecoverySlot, scope: string, payload: unknown, expectedRevision?: number): Promise<void> {
    if (expectedRevision !== undefined && this.currentRevision(slot, scope) !== expectedRevision) throw new Error('RECOVERY_CONFLICT：工作面已被其它页面更新，请重新载入后合并。')
    if (!isSlot(slot) || !scope || scope.length > 16384) throw new Error('恢复账本的范围不对。')
    if (hasSecret(payload)) throw new Error('恢复账本不保存登录凭据。')
    const frame: StoredFrame = {
      seq: maxSeq(this.db) + 1,
      slot,
      scope,
      payload: JSON.stringify(payload),
      at: new Date().toISOString()
    }
    // 帧先落 IndexedDB（掉电兜底），整库导出攒着一把做——一笔一导出是 O(库大小) 的写放大。
    await this.store.appendFrame(frame)
    applyFrame(this.db, frame)
    this.foldedSeq = frame.seq
    if (frame.seq - this.checkpointSeq >= CHECKPOINT_BATCH) {
      this.checkpoint().catch(() => { /* 折库失败不挡写入：帧已经落账本，下一笔再折 */ })
      return
    }
    this.scheduleCheckpoint()
  }

  /** 写回合并：停手一小会儿才折库；连续写就一直攒着，最多攒 CHECKPOINT_BATCH 笔。 */
  private scheduleCheckpoint(): void {
    if (this.checkpointTimer !== undefined) clearTimeout(this.checkpointTimer)
    this.checkpointTimer = setTimeout(() => {
      this.checkpointTimer = undefined
      this.checkpoint().catch(() => { /* 折库失败不挡写入：帧已经落账本，下次再折 */ })
    }, CHECKPOINT_WAIT)
  }

  private async fold(): Promise<void> {
    if (this.checkpointTimer !== undefined) {
      clearTimeout(this.checkpointTimer)
      this.checkpointTimer = undefined
    }
    const through = this.foldedSeq
    if (through <= this.checkpointSeq) return
    compactWal(this.db, through)
    foldJournal(this.db)
    await persistCheckpoint(this.store, this.db.export(), through)
    this.checkpointSeq = through
  }
}

/** 折库节拍：停手 500ms 折一次，攒够 120 笔不等节拍直接折。 */
const CHECKPOINT_WAIT = 500
const CHECKPOINT_BATCH = 120

async function persistCheckpoint(store: RecoveryStore, bytes: Uint8Array, through: number): Promise<void> {
  if (store.commitCheckpoint) await store.commitCheckpoint(bytes, through)
  else { await store.writeCheckpoint(bytes); await store.dropFramesThrough(through) }
}

async function replay(store: RecoveryStore, db: SqlDatabase): Promise<void> {
  const frames = (await store.readFrames()).sort((a, b) => a.seq - b.seq)
  let applied = 0
  for (const frame of frames) {
    if (!isSlot(frame.slot)) continue
    applyFrame(db, frame)
    applied = frame.seq
  }
  if (applied) {
    compactWal(db, applied)
    foldJournal(db)
    await persistCheckpoint(store, db.export(), applied)
  }
}

export async function openRecoveryLedger(store: RecoveryStore): Promise<RecoveryLedger> {
  const SQL = await sqlEngine()
  const bytes = await store.readCheckpoint()
  const db = bytes && bytes.byteLength > 0 ? new SQL.Database(bytes) : new SQL.Database()
  const journal = schema(db)
  await replay(store, db)
  return new RecoveryLedger(store, db, journal)
}

// Production pages never open their own SQLite copy. One service worker owns sequence allocation.
const remote = createRecoveryClient()
// eslint-disable-next-line @typescript-eslint/require-await -- 存量豁免：保留 async 接口契约（Promise 返回）
export async function recoveryLedger() { return remote }
// eslint-disable-next-line @typescript-eslint/require-await -- 存量豁免：保留 async 接口契约（Promise 返回）
export async function recoveryLedgerNow() { return remote }

export async function rememberRecovery(slot: RecoverySlot, scope: string, payload: unknown): Promise<void> {
  // 写不等空闲：这一笔要落盘，等空闲反而可能等不到（关页前的抢救写）。
  const ledger = await recoveryLedgerNow()
  if (!ledger) return
  await ledger.put(slot, scope, payload)
}

export async function forgetRecovery(slot: RecoverySlot, scope: string): Promise<void> {
  const ledger = await recoveryLedgerNow()
  if (!ledger) return
  await ledger.forget(slot, scope)
}

// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- 存量豁免：保留显式联合类型以固定契约
export async function recallRecovery(slot: RecoverySlot, scope: string): Promise<unknown | null> {
  const ledger = await recoveryLedger()
  if (!ledger) return null
  return ledger.get(slot, scope)
}

export async function recallLatest(slot: RecoverySlot): Promise<RecoveryHead | null> {
  const ledger = await recoveryLedger()
  if (!ledger) return null
  return ledger.latest(slot)
}

interface Scheduled {
  slot: RecoverySlot
  scope: string
  read: () => unknown
  timer: number
}

const scheduled = new Map<string, Scheduled>()
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- 存量豁免：保留显式联合类型以固定契约
const held = new Map<string, unknown | null>()

function holdKey(slot: RecoverySlot, scope: string): string {
  return `${slot}\n${scope}`
}

/**
 * 切系统时先把这一侧放进内存，再异步写进恢复账本。
 * 回来时先读内存，没有再读账本，不用等原网站重查。
 */
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- 存量豁免：保留显式联合类型以固定契约
export function holdRecovery(slot: RecoverySlot, scope: string, payload: unknown | null): void {
  const key = holdKey(slot, scope)
  held.set(key, payload)
  const previous = scheduled.get(key)
  if (previous) window.clearTimeout(previous.timer)
  scheduled.delete(key)
  void (payload == null ? forgetRecovery(slot, scope) : rememberRecovery(slot, scope, payload)).catch(() => { /* 内存里还有，下一轮再写账本 */ })
}

// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- 存量豁免：保留显式联合类型以固定契约
export function peekRecovery(slot: RecoverySlot, scope: string): unknown | null | undefined {
  const key = holdKey(slot, scope)
  return held.has(key) ? held.get(key) ?? null : undefined
}

async function commitScheduled(key: string, item: Scheduled): Promise<void> {
  scheduled.delete(key)
  try {
    const payload = item.read()
    if (payload == null) await forgetRecovery(item.slot, item.scope)
    else await rememberRecovery(item.slot, item.scope, payload)
  } catch {
    /* 这一笔没记上，页面上的工作还在。 */
  }
}

/** 连续改动合成一笔。read 返回 null 表示这一轮已经清空，账本里也抹掉。 */
export function scheduleRecovery(slot: RecoverySlot, scope: string, read: () => unknown, wait = 400): void {
  const key = `${slot}\n${scope}`
  const previous = scheduled.get(key)
  if (previous) window.clearTimeout(previous.timer)
  const timer = window.setTimeout(() => { void commitScheduled(key, scheduled.get(key) ?? { slot, scope, read, timer }) }, wait)
  scheduled.set(key, { slot, scope, read, timer })
}

export async function flushRecovery(slot: RecoverySlot, scope: string, read: () => unknown): Promise<void> {
  const key = `${slot}\n${scope}`
  const previous = scheduled.get(key)
  if (previous) window.clearTimeout(previous.timer)
  await commitScheduled(key, { slot, scope, read, timer: 0 })
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    for (const [key, item] of scheduled) {
      window.clearTimeout(item.timer)
      void commitScheduled(key, item)
    }
    // 攒着还没折库的笔趁关页前折掉；折不完也没事，帧还在账本里，下次打开补上。
    void remote.checkpoint().catch(() => { /* 持久帧由后台保留 */ })
  })
}
