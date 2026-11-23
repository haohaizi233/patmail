import { describe, expect, it } from 'vitest'
import { chatCompletion, LlmError, llmFailureKind, modelDialect, servedModel } from '../../../src/agent/llm'
import { AGENT_CONFIG_DEFAULT, agentConnectionIssue, isAgentConfig, normalizeAgentConfig } from '../../../src/agent/config'

const endpoint = 'https://model.example.test/v1'
const builtInEndpoint = 'http://43.138.138.200:8588/v1'
const config = { ...AGENT_CONFIG_DEFAULT, baseUrl: endpoint, approvedEndpoint: endpoint, apiKey: 'fixture-personal-model-key', maxTokens: 100 }

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('agent config', () => {
  it('accepts the default endpoint shape and rejects junk', () => {
    expect(isAgentConfig(AGENT_CONFIG_DEFAULT)).toBe(true)
    expect(isAgentConfig({ baseUrl: 'ftp://x', apiKey: '', model: '', maxTokens: -1 })).toBe(false)
    expect(isAgentConfig(null)).toBe(false)
    expect(normalizeAgentConfig({ ...config, baseUrl: ' http://a/v1/ ', model: ' m ' }).baseUrl).toBe('http://a/v1')
    expect(AGENT_CONFIG_DEFAULT.maxTokens).toBe(8192)
    expect(normalizeAgentConfig({ ...AGENT_CONFIG_DEFAULT, maxTokens: 1024 }).maxTokens).toBe(8192)
    expect(normalizeAgentConfig({ ...AGENT_CONFIG_DEFAULT, maxTokens: 1_048_576 }).maxTokens).toBe(8192)
    expect(normalizeAgentConfig({ ...AGENT_CONFIG_DEFAULT, maxTokens: 64 }).maxTokens).toBe(64)
    expect(normalizeAgentConfig({ ...AGENT_CONFIG_DEFAULT, maxTokens: 16384 }).maxTokens).toBe(16384)
  })

  it('keeps a legacy personal config without granting egress approval', () => {
    const legacy = normalizeAgentConfig({ ...config, approvedEndpoint: undefined })
    expect(legacy).toMatchObject({ baseUrl: endpoint, apiKey: config.apiKey, model: config.model })
    expect(legacy.approvedEndpoint).toBeUndefined()
    expect(AGENT_CONFIG_DEFAULT).toMatchObject({ baseUrl: builtInEndpoint, approvedEndpoint: builtInEndpoint, apiKey: '' })
  })

  it('upgrades the previous default and preserves a saved key for the exact built-in model', () => {
    const blank = normalizeAgentConfig({ ...AGENT_CONFIG_DEFAULT, baseUrl: '', approvedEndpoint: undefined, thinking: true })
    expect(blank).toMatchObject({ baseUrl: builtInEndpoint, approvedEndpoint: builtInEndpoint, thinking: true, apiKey: '' })
    const legacy = normalizeAgentConfig({ ...blank, baseUrl: `${builtInEndpoint}/`, approvedEndpoint: undefined, apiKey: config.apiKey })
    expect(legacy.apiKey).toBe(config.apiKey)
    expect(legacy.approvedEndpoint).toBe(builtInEndpoint)
    expect(agentConnectionIssue(legacy)).toBe('')
  })
})

describe('llm failure kinds', () => {
  it('splits rate limit, auth, overflow and timeout without a fallback chain', () => {
    expect(llmFailureKind(new LlmError('HTTP_ERROR', 'slow', 429))).toBe('rate_limit')
    expect(llmFailureKind(new LlmError('HTTP_ERROR', '模型服务返回 HTTP 502。', 502))).toBe('upstream')
    expect(llmFailureKind(new LlmError('HTTP_ERROR', '模型服务返回 HTTP 503。', 503))).toBe('upstream')
    expect(llmFailureKind(new LlmError('HTTP_ERROR', 'no', 401))).toBe('auth')
    expect(llmFailureKind(new LlmError('HTTP_ERROR', 'maximum context length exceeded', 400))).toBe('overflow')
    expect(llmFailureKind(new LlmError('REQUEST_TIMEOUT', '模型服务请求超时。'))).toBe('timeout')
    expect(llmFailureKind(new LlmError('NETWORK_ERROR', '无法连接模型服务，请检查地址、密钥和网络。'))).toBe('transient')
  })
})

describe('chatCompletion', () => {
  it('blocks unapproved, cleartext and missing-key requests before network dispatch', async () => {
    let requests = 0
    const fetcher = (async () => { requests++; return jsonResponse({}) }) as typeof fetch
    for (const candidate of [
      { ...config, approvedEndpoint: undefined },
      { ...config, baseUrl: 'https://another.example.test/v1' },
      { ...config, baseUrl: 'https://model.example.test/v1?' },
      { ...config, baseUrl: 'http://model.example.test/v1', approvedEndpoint: 'http://model.example.test/v1' },
      { ...config, baseUrl: builtInEndpoint, approvedEndpoint: builtInEndpoint, model: 'different-model' },
      { ...AGENT_CONFIG_DEFAULT, baseUrl: `${builtInEndpoint}/other`, approvedEndpoint: `${builtInEndpoint}/other`, apiKey: config.apiKey },
      AGENT_CONFIG_DEFAULT,
      { ...config, apiKey: '' },
    ]) {
      await expect(chatCompletion(candidate, { messages: [], fetcher })).rejects.toBeInstanceOf(LlmError)
    }
    expect(requests).toBe(0)
  })

  it('sends the built-in model request without a separately saved approval', async () => {
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      expect(url).toBe(`${builtInEndpoint}/chat/completions`)
      expect(init?.redirect).toBe('error')
      return jsonResponse({ choices: [{ message: { content: 'available' } }] })
    }) as typeof fetch
    await expect(chatCompletion({ ...AGENT_CONFIG_DEFAULT, apiKey: config.apiKey, approvedEndpoint: undefined }, {
      messages: [], fetcher,
    })).resolves.toMatchObject({ choices: [{ content: 'available' }] })
  })

  it('allows a directly approved loopback and redacts request payload credentials', async () => {
    const local = 'http://127.0.0.1:8787/v1'
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      expect(url).toBe(`${local}/chat/completions`)
      expect(init?.body).toContain('public support context')
      expect(init?.body).not.toContain(config.apiKey)
      expect(init?.body).not.toContain('separate-session-value')
      return jsonResponse({ choices: [{ message: { content: 'available' } }] })
    }) as typeof fetch
    await expect(chatCompletion({ ...config, baseUrl: local, approvedEndpoint: local }, {
      messages: [{ role: 'user', content: `public support context ${config.apiKey}\nCookie: separate-session-value` }],
      fetcher,
    })).resolves.toMatchObject({ choices: [{ content: 'available' }] })
  })

  it('posts to baseUrl/chat/completions with x-api-key and bearer headers', async () => {
    let capturedUrl = ''
    let capturedInit: RequestInit | undefined
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- 存量豁免：外部数据宽松 String() 兜底，保留既有校验行为
      capturedUrl = String(url)
      capturedInit = init
      return jsonResponse({ choices: [{ message: { role: 'assistant', content: '你好' }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 2 } })
    }) as typeof fetch
    const outcome = await chatCompletion(config, { messages: [{ role: 'user', content: '你好' }], fetcher })
    expect(capturedUrl).toBe(`${endpoint}/chat/completions`)
    expect(capturedInit?.method).toBe('POST')
    expect(capturedInit).toMatchObject({ credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' })
    const headers = new Headers(capturedInit?.headers)
    expect(headers.get('x-api-key')).toBe(config.apiKey)
    expect(headers.get('authorization')).toBe(`Bearer ${config.apiKey}`)
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- 存量豁免：外部数据宽松 String() 兜底，保留既有校验行为
    const body = JSON.parse(String(capturedInit?.body)) as Record<string, unknown>
    expect(body.model).toBe(config.model)
    expect(body.max_tokens).toBe(100)
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false })
    expect(outcome.choices[0]?.reasoning).toBe('')
    expect(outcome.choices[0]?.content).toBe('你好')
    expect(outcome.usage).toEqual({ promptTokens: 5, completionTokens: 2 })
    expect(servedModel(outcome, config.model)).toBe(config.model)
  })

  it('reports the model name the server sent back', async () => {
    const fetcher = (async () => jsonResponse({
      model: 'Qwen3.6-35B-A3B-oQ4-fp16-mtp',
      choices: [{ message: { role: 'assistant', content: '在' }, finish_reason: 'stop' }]
    })) as typeof fetch
    const outcome = await chatCompletion(config, { messages: [{ role: 'user', content: '你好' }], fetcher })
    expect(servedModel(outcome, 'other')).toBe('Qwen3.6-35B-A3B-oQ4-fp16-mtp')
  })

  it('sends enable_thinking and keeps the reasoning chain when thinking is on', async () => {
    let captured = ''
    const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- 存量豁免：外部数据宽松 String() 兜底，保留既有校验行为
      captured = String(init?.body)
      return jsonResponse({
        choices: [{ message: { role: 'assistant', content: '结论', reasoning_content: '先核对字段' }, finish_reason: 'stop' }]
      })
    }) as typeof fetch
    const outcome = await chatCompletion({ ...config, thinking: true }, { messages: [{ role: 'user', content: '你好' }], fetcher })
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- 存量豁免：外部 XML/JSON any 数据流，类型收口待后续
    expect(JSON.parse(captured).chat_template_kwargs).toEqual({ enable_thinking: true })
    expect(outcome.choices[0]?.content).toBe('结论')
    expect(outcome.choices[0]?.reasoning).toBe('先核对字段')
  })

  it('parses tool calls when the model asks for them', async () => {
    const fetcher = (async () => jsonResponse({
      choices: [{
        message: { role: 'assistant', content: '', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'search_files', arguments: '{"q":"x"}' } }] },
        finish_reason: 'tool_calls'
      }]
    })) as typeof fetch
    const outcome = await chatCompletion(config, { messages: [{ role: 'user', content: '查一下' }], fetcher })
    expect(outcome.choices[0]?.toolCalls).toEqual([{ id: 'call_1', type: 'function', function: { name: 'search_files', arguments: '{"q":"x"}' } }])
    expect(outcome.choices[0]?.finishReason).toBe('tool_calls')
  })

  it('maps HTTP errors to LlmError with status', async () => {
    const fetcher = (async () => new Response('unauthorized', { status: 401 })) as typeof fetch
    await expect(chatCompletion(config, { messages: [{ role: 'user', content: 'hi' }], fetcher })).rejects.toSatisfy((error: unknown) => {
      return error instanceof LlmError && error.code === 'HTTP_ERROR' && error.status === 401
    })
  })

  it('rejects non-JSON responses as INVALID_RESPONSE', async () => {
    const fetcher = (async () => new Response('<html>bad</html>', { status: 200 })) as typeof fetch
    await expect(chatCompletion(config, { messages: [{ role: 'user', content: 'hi' }], fetcher })).rejects.toSatisfy((error: unknown) => {
      return error instanceof LlmError && error.code === 'INVALID_RESPONSE'
    })
  })

  it('times out into REQUEST_TIMEOUT', async () => {
    const fetcher = (async (_input: string | URL | Request, init?: RequestInit) => {
      await new Promise((_resolve, reject) => {
        const timer = setTimeout(_resolve, 200)
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(new DOMException('aborted', 'AbortError'))
        }, { once: true })
      })
      return jsonResponse({})
    }) as typeof fetch
    await expect(chatCompletion(config, { messages: [{ role: 'user', content: 'hi' }], fetcher, timeoutMs: 20 })).rejects.toSatisfy((error: unknown) => {
      return error instanceof LlmError && error.code === 'REQUEST_TIMEOUT'
    })
  })

  it('streams reasoning deltas and keeps the assembled answer', async () => {
    const events = [
      { choices: [{ delta: { reasoning_content: '先看文号' } }] },
      { choices: [{ delta: { reasoning_content: '，再回答' }, finish_reason: null }] },
      { choices: [{ delta: { content: '可以查。' }, finish_reason: 'stop' }] }
    ]
    const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string, @typescript-eslint/no-unsafe-member-access -- 存量豁免：多项历史存量，理由见 docs/ci/quality-gates.md
      expect(JSON.parse(String(init?.body)).stream).toBe(true)
      const body = events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n'
      return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    }) as typeof fetch
    const seen: string[] = []
    const outcome = await chatCompletion(config, {
      messages: [{ role: 'user', content: '查一下' }],
      fetcher,
      onDelta: partial => seen.push(partial.reasoning)
    })
    expect(seen).toEqual(['先看文号', '先看文号，再回答', '先看文号，再回答'])
    expect(outcome.choices[0]?.reasoning).toBe('先看文号，再回答')
    expect(outcome.choices[0]?.content).toBe('可以查。')
  })

  it('talks to MiMo with api-key, thinking and max_completion_tokens', async () => {
    let captured = ''
    let headers: Headers | undefined
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- 存量豁免：外部数据宽松 String() 兜底，保留既有校验行为
      captured = String(init?.body)
      headers = new Headers(init?.headers)
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- 存量豁免：外部数据宽松 String() 兜底，保留既有校验行为
      expect(String(url)).toBe('https://api.xiaomimimo.com/v1/chat/completions')
      return jsonResponse({ choices: [{ message: { content: '我是备用。' }, finish_reason: 'stop' }] })
    }) as typeof fetch
    const mimoEndpoint = 'https://api.xiaomimimo.com/v1'
    const backup = { ...config, baseUrl: mimoEndpoint, approvedEndpoint: mimoEndpoint, model: 'mimo-v2.6-pro', thinking: true }
    expect(modelDialect(backup)).toBe('mimo')
    expect(backup.model).toBe('mimo-v2.6-pro')
    const outcome = await chatCompletion(backup, { messages: [{ role: 'user', content: '你好' }], fetcher })
    const body = JSON.parse(captured) as Record<string, unknown>
    expect(body.model).toBe(backup.model)
    expect(body.thinking).toEqual({ type: 'enabled' })
    expect(body.max_completion_tokens).toBe(100)
    expect(body.chat_template_kwargs).toBeUndefined()
    expect(body.max_tokens).toBeUndefined()
    expect(headers?.get('api-key')).toBe(backup.apiKey)
    expect(headers?.get('authorization')).toBe(`Bearer ${backup.apiKey}`)
    expect(outcome.choices[0]?.content).toBe('我是备用。')
  })
})

describe('model connection failures', () => {
  it('does not hand off a failed request to another service', async () => {
    const requests: Array<string | URL | Request> = []
    const fetcher = (async (url: string | URL | Request) => {
      requests.push(url)
      return new Response('bad gateway', { status: 502 })
    }) as typeof fetch
    await expect(chatCompletion(config, { messages: [{ role: 'user', content: '你好' }], fetcher }))
      .rejects.toMatchObject({ code: 'HTTP_ERROR', status: 502 })
    expect(requests).toEqual([`${endpoint}/chat/completions`])
  })

  it('redacts echoed credentials and keeps raw error responses out of activity', async () => {
    const authLine = ['Authorization:', 'Bearer', 'fixture-other-value'].join(' ')
    const response = jsonResponse({
      choices: [{ message: { content: `echo ${config.apiKey}\n${authLine}` } }],
    })
    const fetcher = (async () => response) as typeof fetch
    const outcome = await chatCompletion(config, { messages: [], fetcher })
    expect(outcome.choices[0]?.content).not.toMatch(/fixture-personal-model-key|fixture-other-value/)
    const rejected = (async () => new Response('private business response body', { status: 401 })) as typeof fetch
    await expect(chatCompletion(config, { messages: [], fetcher: rejected }))
      .rejects.toMatchObject({ message: '模型服务返回 HTTP 401。' })
  })

  it('does not switch when the primary rejects the key or the user stops', async () => {
    let calls = 0
    const denied = (async () => {
      calls += 1
      return new Response('unauthorized', { status: 401 })
    }) as typeof fetch
    await expect(chatCompletion(config, { messages: [{ role: 'user', content: 'hi' }], fetcher: denied })).rejects.toSatisfy((error: unknown) => {
      return error instanceof LlmError && error.status === 401
    })
    expect(calls).toBe(1)

    const stopped = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls += 1
      init?.signal?.throwIfAborted?.()
      throw new DOMException('aborted', 'AbortError')
    }) as typeof fetch
    const signal = AbortSignal.abort()
    await expect(chatCompletion(config, { messages: [{ role: 'user', content: 'hi' }], fetcher: stopped, signal })).rejects.toSatisfy((error: unknown) => {
      return error instanceof LlmError && error.message === '已停下。'
    })
    expect(calls).toBe(1)
  })

  it('does not switch after the primary has already started streaming', async () => {
    let calls = 0
    const fetcher = (async () => {
      calls += 1
      const encoder = new TextEncoder()
      let sent = false
      const stream = new ReadableStream({
        pull(controller) {
          if (!sent) {
            sent = true
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: '半句' } }] })}\n\n`))
            return
          }
          controller.error(new Error('socket closed'))
        }
      })
      return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    }) as typeof fetch
    await expect(chatCompletion(config, {
      messages: [{ role: 'user', content: 'hi' }],
      fetcher,
      onDelta: () => {}
    })).rejects.toBeInstanceOf(LlmError)
    expect(calls).toBe(1)
  })
})
