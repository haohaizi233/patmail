import type { ToolSchema } from '../llm'
import type { AgentMemoryState } from '../memory'
import { toolDone, type ToolContext, type ToolOutcome } from './contracts'

export const CONNECTION_TOOL_SCHEMAS: readonly ToolSchema[] = [
  {
    type: 'function',
    function: {
      name: 'connection_status',
      description: '查看当前是否已连上 EASY、登录人是谁。查案件或期限之前先看这个。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
]

export function executeConnectionTool(
  name: string,
  _args: Record<string, unknown>,
  ctx: ToolContext,
  memory: AgentMemoryState,
): ToolOutcome | null {
  if (name !== 'connection_status') return null
  const snap = ctx.snapshot()
  return toolDone(
    snap.connected ? `已连接 ${snap.displayName || '当前登录人'}，站点 ${snap.origin}。` : (snap.message || '尚未连接 EASY。'),
    memory,
    snap.connected,
  )
}
