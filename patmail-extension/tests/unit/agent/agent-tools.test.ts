import { describe, expect, it } from 'vitest'
import { EMPTY_MEMORY, saveMemory, loadMemory, type MemoryStorage } from '../../../src/agent/memory'
import { MessageType } from '../../../src/shared/message'
import { executeAgentTool, type ToolContext } from '../../../src/agent/tools'
import { idleContext } from './support/agent-test-kit'

describe('agent tools', () => {
  it('remembers through the tool and reports a missing connection', async () => {
    const remembered = await executeAgentTool('remember', '{"text":"先看法律期限"}', idleContext, EMPTY_MEMORY)
    expect(remembered.text).toContain('已记住')
    expect(remembered.memory.facts).toHaveLength(1)
    const status = await executeAgentTool('connection_status', '{}', idleContext, EMPTY_MEMORY)
    expect(status.text).toContain('尚未连接')
  })

  it('forwards a file search and summarizes the rows', async () => {
    let forwarded: unknown
    const ctx: ToolContext = {
      ...idleContext,
      forward: async message => {
        forwarded = message
        return {
          type: MessageType.SearchFilesResult,
          payload: {
            ok: true,
            data: {
              items: [{ fileId: 'f1', fileName: '受理通知书', caseVolume: 'P001', customerName: '甲公司' }],
              total: 1, pageIndex: 1, pageSize: 20, totalPages: 1
            }
          }
        }
      }
    }
    const result = await executeAgentTool('search_cases', '{"caseVolume":"P001"}', ctx, EMPTY_MEMORY)
    expect(forwarded).toMatchObject({ type: MessageType.SearchFiles, payload: { query: { caseVolume: 'P001', pageIndex: 1, pageSize: 20 } } })
    expect(result.text).toContain('P001')
    expect(result.text).toContain('共 1 条')
    expect(result.text).toContain('每页 20 条')
    expect(result.ok).toBe(true)
    expect(result.memory.work?.files.map(file => file.fileId)).toEqual(['f1'])
  })

  it('turns the file page like the query screen and keeps the files for the next turn', async () => {
    const pages = new Map<number, string>([[1, 'f1'], [2, 'f2']])
    const ctx: ToolContext = {
      ...idleContext,
      rememberFiles() {},
      forward: async message => {
        const page = message.type === MessageType.SearchFiles ? message.payload.query.pageIndex : 1
        return {
          type: MessageType.SearchFilesResult,
          payload: {
            ok: true,
            data: {
              items: [{ fileId: pages.get(page) ?? 'f', fileName: '受理通知书', caseVolume: 'P001' }],
              total: 40, pageIndex: page, pageSize: 20, totalPages: 2
            }
          }
        }
      }
    }
    const first = await executeAgentTool('search_cases', '{"caseVolume":"P001"}', ctx, EMPTY_MEMORY)
    expect(first.text).toContain('第 1 / 2 页')
    expect(first.text).toContain('页码填 2')
    const second = await executeAgentTool('search_cases', '{"caseVolume":"P001","page":2}', ctx, first.memory)
    expect(second.memory.work?.files.map(file => file.fileId)).toEqual(['f1', 'f2'])
    const rejected = await executeAgentTool('search_cases', '{"caseVolume":"P001","pageSize":10}', ctx, EMPTY_MEMORY)
    expect(rejected.ok).toBe(false)
    expect(rejected.text).toContain('20、50 或 100')
    const area: MemoryStorage = {
      async get(key) { return { [key]: bag[key] } },
      async set(items) { Object.assign(bag, items) }
    }
    const bag: Record<string, unknown> = {}
    await saveMemory(area, second.memory)
    const loaded = await loadMemory(area)
    expect(loaded.work?.files.map(file => file.fileId)).toEqual(['f1', 'f2'])
  })

  it('stops before a tool call when the turn is already cancelled', async () => {
    const signal = AbortSignal.abort()
    await expect(executeAgentTool('search_cases', '{"caseVolume":"P001"}', { ...idleContext, signal }, EMPTY_MEMORY)).rejects.toThrow('已停下。')
  })
})
