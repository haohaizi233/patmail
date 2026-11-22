import { readAgentQuestions } from '../ask'
import { LlmError, type ToolSchema } from '../llm'
import { rememberFact, searchFacts, type AgentMemoryState } from '../memory'
import { formatWorkPlan, readWorkPlan } from '../plan'
import { stopIfNeeded, textArg, toolDone, type ToolContext, type ToolOutcome } from './contracts'

export const MEMORY_TOOL_SCHEMAS: readonly ToolSchema[] = [
  {
    type: 'function',
    function: {
      name: 'plan_work',
      description: '一件事要分好几步时，先写下 2 到 6 步再动手。每步 title 是给用户看的短标题，tool 是现有工具名。写完按顺序调用，一步成功再做下一步。只查一次的小事不要用。',
      parameters: {
        type: 'object',
        properties: {
          steps: {
            type: 'array',
            description: '二到六步',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string', description: '这一步做什么' },
                tool: { type: 'string', description: '办成这一步要用的工具名' },
                args: { type: 'string', description: '这一步要传的参数，JSON 对象字符串。查案件或查期限时写上，勾选时会对上' },
              },
              required: ['title', 'tool'],
            },
          },
        },
        required: ['steps'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ask_user',
      description: '缺了只有用户知道的内容时，向用户提一到三个问题。有固定选项就填 choices，要用户自己写就留空。可以多选时 multiple 为 true。选项只是范围、还要写具体内容时 needsText 为 true。用户答完再继续办。',
      parameters: {
        type: 'object',
        properties: {
          questions: {
            type: 'array',
            description: '一到三个问题',
            items: {
              type: 'object',
              properties: {
                prompt: { type: 'string', description: '问句' },
                placeholder: { type: 'string', description: '输入提示，可空' },
                choices: { type: 'array', items: { type: 'string' }, description: '可点的选项，没有就空着' },
                multiple: { type: 'boolean', description: '可以多选' },
                needsText: { type: 'boolean', description: '还要用户写上具体内容' },
              },
              required: ['prompt'],
            },
          },
        },
        required: ['questions'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remember',
      description: '记住用户明确说过、以后还要用的偏好或事实，包括给助手起名。必须提供可核对的source原句；实际保存原句，不保存未经核对的概括。不要记密码或一次性查询结果。',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '要记住的意图，也可直接复制原句' },
          source: { type: 'string', minLength: 2, maxLength: 240, description: '逐字复制用户消息或本次成功工具结果中的原句。例如用户说“你以后就叫小桃了”，这里就填“你以后就叫小桃了”，不要改写成“助手名字是小桃”' },
        },
        required: ['text', 'source'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recall',
      description: '从长期记忆里找出和这句话有关的事实。不给关键词就返回最近记住的。',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: '关键词，可空' } },
        additionalProperties: false,
      },
    },
  },
]

export async function executeMemoryTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
  memory: AgentMemoryState,
  knownToolNames: ReadonlySet<string>,
): Promise<ToolOutcome | null> {
  if (name === 'plan_work') {
    const steps = readWorkPlan(args, knownToolNames)
    if (!steps) return toolDone('计划要写 2 到 6 步，每步一个短标题和现有工具名。', memory, false)
    return toolDone(formatWorkPlan(steps), memory, true)
  }
  if (name === 'ask_user') {
    const questions = readAgentQuestions(args)
    if (!questions) return toolDone('问题没有写清，没有向用户提问。', memory, false)
    if (!ctx.askUser) return toolDone('现在没有人可以回答。', memory, false)
    stopIfNeeded(ctx)
    const answer = await ctx.askUser(questions)
    if (answer === '已停下。') throw new LlmError('REQUEST_TIMEOUT', '已停下。')
    if (answer === '跳过') return toolDone('用户跳过了这个问题。', memory, false)
    return toolDone(`用户答：\n${answer}`, memory, true)
  }
  if (name === 'remember') {
    const text = textArg(args, 'text', 240)
    if (!text) return toolDone('没有可记的内容。', memory, false)
    const next = rememberFact(memory, text)
    return toolDone(next === memory ? '这句话已经在长期记忆里。' : `已记住：${text}`, next, true)
  }
  if (name === 'recall') {
    const found = searchFacts(memory, textArg(args, 'query', 80))
    return toolDone(
      found.length === 0 ? '长期记忆里没有对上的内容。' : found.map(fact => fact.text).join('\n'),
      memory,
      true,
    )
  }
  return null
}
