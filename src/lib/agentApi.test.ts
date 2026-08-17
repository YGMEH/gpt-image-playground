import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PARAMS } from '../types'
import { createDefaultOpenAIProfile, DEFAULT_SETTINGS } from './apiProfiles'
import { callAgentConversationTitleApi, callAgentResponsesApi, callWorkflowPromptApi, parseBatchImageCallArguments } from './agentApi'

describe('parseBatchImageCallArguments', () => {
  it('trims ids and prompts, fills missing ids, and skips empty prompts', () => {
    expect(parseBatchImageCallArguments(JSON.stringify({ images: [
      { id: ' hero ', prompt: ' first prompt ' },
      { id: '   ', prompt: 'blank id' },
      { prompt: 'missing id' },
      { id: 'skipped', prompt: '   ' },
    ] }))).toEqual([
      { id: 'hero', prompt: 'first prompt' },
      { id: 'image_2', prompt: 'blank id' },
      { id: 'image_3', prompt: 'missing id' },
    ])
  })

  it('makes duplicate and colliding ids deterministically unique', () => {
    const args = JSON.stringify({ images: [
      { id: 'same', prompt: 'one' },
      { id: ' same ', prompt: 'two' },
      { id: 'same_2', prompt: 'three' },
      { id: 'same', prompt: 'four' },
    ] })

    expect(parseBatchImageCallArguments(args)).toEqual([
      { id: 'same', prompt: 'one' },
      { id: 'same_2', prompt: 'two' },
      { id: 'same_2_2', prompt: 'three' },
      { id: 'same_3', prompt: 'four' },
    ])
    expect(parseBatchImageCallArguments(args)).toEqual(parseBatchImageCallArguments(args))
  })
})

describe('callAgentResponsesApi', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('streams Agent text and requests configured partial images', async () => {
    const streamBody = [
      'data: {"type":"response.output_text.delta","delta":"Hel"}',
      '',
      'data: {"type":"response.output_text.delta","delta":"lo"}',
      '',
      'data: {"type":"response.completed","response":{"id":"resp_1","output":[{"type":"message","content":[{"type":"output_text","text":"Hello"}]},{"type":"image_generation_call","id":"ig_1","result":"ZmluYWw=","size":"1024x1024"}]}}',
      '',
      'data: [DONE]',
      '',
    ].join('\n')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(streamBody, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }))
    const textDeltas: string[] = []
    const profile = createDefaultOpenAIProfile({
      apiKey: 'test-key',
      apiMode: 'responses',
      streamImages: true,
      streamPartialImages: 2,
      reasoningEffort: 'xhigh',
    })

    const result = await callAgentResponsesApi({
      settings: DEFAULT_SETTINGS,
      profile,
      params: DEFAULT_PARAMS,
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'prompt' }] }],
      onTextDelta: (delta) => textDeltas.push(delta),
    })

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(String((init as RequestInit).body))
    expect(body.stream).toBe(true)
    expect(body.reasoning).toEqual({ effort: 'xhigh' })
    expect(body.tools[0].partial_images).toBe(2)
    expect(textDeltas).toEqual(['Hel', 'lo'])
    expect(result).toMatchObject({
      responseId: 'resp_1',
      text: 'Hello',
      images: [{ toolCallId: 'ig_1', dataUrl: 'data:image/png;base64,ZmluYWw=' }],
    })
  })

  it('reports failed image output item without aborting the ongoing stream', async () => {
    const streamBody = [
      'data: {"type":"response.output_item.added","item":{"id":"ig_fail","type":"image_generation_call","status":"in_progress"},"output_index":0}',
      '',
      'data: {"type":"response.output_item.done","item":{"id":"ig_fail","type":"image_generation_call","status":"failed","error":{"message":"safety rejected"}},"output_index":0}',
      '',
      'data: {"type":"response.output_text.delta","delta":"已跳过失败图片"}',
      '',
      'data: {"type":"response.completed","response":{"id":"resp_1","output":[{"id":"ig_fail","type":"image_generation_call","status":"failed","error":{"message":"safety rejected"}},{"type":"message","content":[{"type":"output_text","text":"已跳过失败图片"}]}]}}',
      '',
      'data: [DONE]',
      '',
    ].join('\n')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(streamBody, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }))
    const failures: Array<{ toolCallId: string; error: string }> = []
    const profile = createDefaultOpenAIProfile({
      apiKey: 'test-key',
      apiMode: 'responses',
      streamImages: true,
    })

    const result = await callAgentResponsesApi({
      settings: DEFAULT_SETTINGS,
      profile,
      params: DEFAULT_PARAMS,
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'prompt' }] }],
      onImageToolFailed: (event) => {
        failures.push(event)
      },
    })

    expect(failures).toEqual([{ toolCallId: 'ig_fail', error: 'safety rejected' }])
    expect(result).toMatchObject({
      responseId: 'resp_1',
      text: '已跳过失败图片',
      images: [],
    })
    expect(result.rawResponsePayload).toContain('resp_1')
  })

  it('passes mask data to the Agent image tool', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      output: [{
        type: 'message',
        content: [{ type: 'output_text', text: 'OK' }],
      }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    const profile = createDefaultOpenAIProfile({
      apiKey: 'test-key',
      apiMode: 'responses',
    })

    await callAgentResponsesApi({
      settings: DEFAULT_SETTINGS,
      profile,
      params: DEFAULT_PARAMS,
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'edit' }] }],
      maskDataUrl: 'data:image/png;base64,bWFzaw==',
    })

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(String((init as RequestInit).body))
    expect(body.tools[0].input_image_mask).toEqual({ image_url: 'data:image/png;base64,bWFzaw==' })
  })

  it('requires resolution in Agent prompts and omits the Codex CLI size parameter', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'OK' }] }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    const profile = createDefaultOpenAIProfile({
      apiKey: 'test-key',
      apiMode: 'responses',
      codexCli: true,
    })

    await callAgentResponsesApi({
      settings: DEFAULT_SETTINGS,
      profile,
      params: { ...DEFAULT_PARAMS, size: '1024x1024' },
      input: 'prompt',
    })

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(String((init as RequestInit).body))
    expect(body.tools[0].size).toBeUndefined()
    expect(body.instructions).toContain('Start every image prompt with exactly "Generate at 1024x1024 resolution." followed by a space.')
  })

  it('extracts image_generation results from base64 object fields', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      output: [{
        type: 'image_generation_call',
        id: 'ig_base64',
        result: { base64: 'ZmlsZQ==' },
      }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    const profile = createDefaultOpenAIProfile({
      apiKey: 'test-key',
      apiMode: 'responses',
    })

    const result = await callAgentResponsesApi({
      settings: DEFAULT_SETTINGS,
      profile,
      params: DEFAULT_PARAMS,
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'prompt' }] }],
    })

    expect(result.images).toEqual([{
      toolCallId: 'ig_base64',
      dataUrl: 'data:image/png;base64,ZmlsZQ==',
      actualParams: {},
    }])
  })

  it('stops reading a stream when the caller aborts after output starts', async () => {
    const streamBody = [
      'data: {"type":"response.output_text.delta","delta":"Hel"}',
      '',
      '',
    ].join('\n')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(streamBody))
        controller.close()
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }))
    const textDeltas: string[] = []
    const abortController = new AbortController()
    const profile = createDefaultOpenAIProfile({
      apiKey: 'test-key',
      apiMode: 'responses',
      streamImages: true,
    })

    await expect(callAgentResponsesApi({
      settings: DEFAULT_SETTINGS,
      profile,
      params: DEFAULT_PARAMS,
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'prompt' }] }],
      signal: abortController.signal,
      onTextDelta: (delta) => {
        textDeltas.push(delta)
        abortController.abort()
      },
    })).rejects.toMatchObject({ name: 'AbortError' })

    expect(textDeltas).toEqual(['Hel'])
  })

  it('generates a short conversation title without image tools', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      output: [{
        type: 'message',
        content: [{ type: 'output_text', text: '<title>生成猫咪头像</title>' }],
      }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    const profile = createDefaultOpenAIProfile({
      apiKey: 'test-key',
      apiMode: 'responses',
      streamImages: true,
      reasoningEffort: 'max',
    })

    const title = await callAgentConversationTitleApi({
      settings: DEFAULT_SETTINGS,
      profile,
      prompt: '帮我生成一张橘猫头像，要赛博朋克风格',
    })

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(String((init as RequestInit).body))
    expect(body.instructions).toContain('<title>short title</title>')
    expect(body.reasoning).toEqual({ effort: 'max' })
    expect(body.max_output_tokens).toBeUndefined()
    expect(body.tools).toBeUndefined()
    expect(body.stream).toBeUndefined()
    expect(body.input[0].content[0].text).toContain('帮我生成一张橘猫头像，要赛博朋克风格')
    expect(title).toBe('生成猫咪头像')
  })

  it('requests web search and applies citations', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      id: 'resp_search',
      output: [
        {
          type: 'web_search_call',
          id: 'ws_1',
          status: 'completed',
          action: { type: 'search', query: 'OpenAI web search docs' },
        },
        {
          type: 'message',
          content: [{
            type: 'output_text',
            text: 'See OpenAI docs.',
            annotations: [{
              type: 'url_citation',
              start_index: 4,
              end_index: 15,
              url: 'https://platform.openai.com/docs',
              title: 'OpenAI Docs',
            }],
          }],
        },
      ],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    const profile = createDefaultOpenAIProfile({
      apiKey: 'test-key',
      apiMode: 'responses',
    })

    const result = await callAgentResponsesApi({
      settings: { ...DEFAULT_SETTINGS, agentWebSearch: true },
      profile,
      params: DEFAULT_PARAMS,
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'prompt' }] }],
    })

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(String((init as RequestInit).body))
    expect(body.tools).toEqual(expect.arrayContaining([{ type: 'web_search' }]))
    expect(result.text).toBe('See [OpenAI docs](https://platform.openai.com/docs).')
    expect(result.outputItems?.[0]).toMatchObject({ type: 'web_search_call', status: 'completed' })
  })

  it('injects configurable math formatting instructions', async () => {
    const createResponse = () => new Response(JSON.stringify({
      output: [{
        type: 'message',
        content: [{ type: 'output_text', text: 'OK' }],
      }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => createResponse())
    const profile = createDefaultOpenAIProfile({
      apiKey: 'test-key',
      apiMode: 'responses',
    })

    await callAgentResponsesApi({
      settings: DEFAULT_SETTINGS,
      profile,
      params: DEFAULT_PARAMS,
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'prompt' }] }],
    })

    let body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
    expect(body.instructions).toContain('## Math formatting')
    expect(body.instructions).toContain('Use `$...$` for inline formulas.')

    await callAgentResponsesApi({
      settings: { ...DEFAULT_SETTINGS, agentMathFormattingPrompt: false },
      profile,
      params: DEFAULT_PARAMS,
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'prompt' }] }],
    })

    body = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))
    expect(body.instructions).not.toContain('## Math formatting')
  })

  it("does not duplicate the assistant message item when response.completed lacks an item id", async () => {
    // `response.completed` can repeat the streamed item without id; it should merge, not append.
    const itemId = "msg_abc123"
    const streamBody = [
      `data: {"type":"response.created","response":{"id":"resp_1","output":[]}}`,
      ``,
      `data: {"type":"response.output_item.added","item":{"id":"${itemId}","type":"message","status":"in_progress","content":[],"role":"assistant"}}`,
      ``,
      `data: {"type":"response.output_text.delta","delta":"hi","item_id":"${itemId}"}`,
      ``,
      `data: {"type":"response.output_text.delta","delta":"!","item_id":"${itemId}"}`,
      ``,
      `data: {"type":"response.output_item.done","item":{"id":"${itemId}","type":"message","status":"completed","content":[{"type":"output_text","text":"hi!"}],"role":"assistant"}}`,
      ``,
      `data: {"type":"response.completed","response":{"id":"resp_1","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"hi!"}]}]}}`,
      ``,
      `data: [DONE]`,
      ``,
    ].join("\n")
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(streamBody, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }))
    const outputItemSnapshots: number[] = []
    const profile = createDefaultOpenAIProfile({
      apiKey: "test-key",
      apiMode: "responses",
      streamImages: true,
    })

    const result = await callAgentResponsesApi({
      settings: DEFAULT_SETTINGS,
      profile,
      params: DEFAULT_PARAMS,
      input: [{ role: "user", content: [{ type: "input_text", text: "hi" }] }],
      onOutputItems: (items) => outputItemSnapshots.push(items.length),
    })

    const messageItems = (result.outputItems ?? []).filter((item) => item.type === "message")
    expect(messageItems).toHaveLength(1)
    expect(result.text).toBe("hi!")
    expect(outputItemSnapshots[outputItemSnapshots.length - 1]).toBe(1)
  })

  it('streams Chat Completions text and reassembles tool-call deltas', async () => {
    const streamBody = [
      `data: ${JSON.stringify({ id: 'chat_stream_1', choices: [{ delta: { content: 'Hel' } }] })}`,
      '',
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'lo', tool_calls: [{ index: 0, id: 'call_1', function: { name: 'generate_image', arguments: '{"prompt":"cat' } }] } }] })}`,
      '',
      `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"}' } }] } }] })}`,
      '',
      'data: [DONE]',
      '',
    ].join('\n')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(streamBody, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }))
    const textDeltas: string[] = []
    const outputSnapshots: string[] = []
    const profile = createDefaultOpenAIProfile({
      apiKey: 'test-key',
      apiMode: 'chat',
      model: 'deepseek-chat',
      baseUrl: 'https://api.deepseek.com',
    })
    const result = await callAgentResponsesApi({
      settings: { ...DEFAULT_SETTINGS, agentApiConfigMode: 'hybrid' },
      profile,
      params: DEFAULT_PARAMS,
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'make it' }] }],
      onTextDelta: (delta) => textDeltas.push(delta),
      onOutputItems: (items) => outputSnapshots.push(items.map((item) => item.type).join(',')),
    })
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(String((init as RequestInit).body))
    expect(body.stream).toBe(true)
    expect(textDeltas).toEqual(['Hel', 'lo'])
    expect(result.responseId).toBe('chat_stream_1')
    expect(result.text).toBe('Hello')
    expect(result.outputItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'function_call',
        call_id: 'call_1',
        name: 'generate_image',
        arguments: '{"prompt":"cat"}',
      }),
    ]))
    expect(outputSnapshots.length).toBeGreaterThan(0)
  })

  it('sends Chat Completions requests for chat profiles and converts tool calls', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      id: 'chatcmpl_1',
      choices: [{
        message: {
          role: 'assistant',
          content: '先生成封面',
          tool_calls: [{
            id: 'call_cover',
            type: 'function',
            function: {
              name: 'generate_image',
              arguments: '{"id":"cover","prompt":"a cover"}',
            },
          }],
        },
      }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    const profile = createDefaultOpenAIProfile({
      apiKey: 'test-key',
      apiMode: 'chat',
      model: 'deepseek-chat',
      baseUrl: 'https://api.deepseek.com',
    })

    const result = await callAgentResponsesApi({
      settings: { ...DEFAULT_SETTINGS, agentApiConfigMode: 'hybrid' },
      profile,
      params: DEFAULT_PARAMS,
      input: [{ role: 'user', content: [{ type: 'input_text', text: '帮我做一张封面' }] }],
    })

    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.deepseek.com/v1/chat/completions')
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(String((init as RequestInit).body))
    expect(body.messages[0]).toMatchObject({ role: 'system' })
    expect(body.messages.some((message: { role: string; content?: string }) => message.role === 'user' && String(message.content).includes('帮我做一张封面'))).toBe(true)
    expect(body.input).toBeUndefined()
    expect(body.tools).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'function',
        function: expect.objectContaining({ name: 'generate_image' }),
      }),
    ]))
    expect(result).toMatchObject({
      responseId: 'chatcmpl_1',
      text: '先生成封面',
    })
    expect(result.outputItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'function_call',
        call_id: 'call_cover',
        name: 'generate_image',
      }),
    ]))
  })

  it('forwards reference images as OpenAI vision parts in chat mode', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      id: 'chatcmpl_vision',
      choices: [{ message: { role: 'assistant', content: '看到图了' } }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    const profile = createDefaultOpenAIProfile({
      apiKey: 'test-key',
      apiMode: 'chat',
      model: 'gemini-3.1-flash-lite',
      baseUrl: 'https://grsai.dakka.com.cn',
    })

    await callAgentResponsesApi({
      settings: { ...DEFAULT_SETTINGS, agentApiConfigMode: 'hybrid' },
      profile,
      params: DEFAULT_PARAMS,
      input: [{
        role: 'user',
        content: [
          { type: 'input_text', text: '分析这张图' },
          { type: 'input_image', image_url: 'data:image/png;base64,aGk=' },
        ],
      }],
    })

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(String((init as RequestInit).body))
    const userMessage = body.messages.find((message: { role: string }) => message.role === 'user')
    expect(Array.isArray(userMessage.content)).toBe(true)
    expect(userMessage.content).toEqual([
      { type: 'text', text: '分析这张图' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,aGk=' } },
    ])
  })

  it('keeps text-only chat messages as plain strings', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      id: 'chatcmpl_text',
      choices: [{ message: { role: 'assistant', content: 'ok' } }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    const profile = createDefaultOpenAIProfile({
      apiKey: 'test-key',
      apiMode: 'chat',
      model: 'deepseek-chat',
      baseUrl: 'https://api.deepseek.com',
    })

    await callAgentResponsesApi({
      settings: { ...DEFAULT_SETTINGS, agentApiConfigMode: 'hybrid' },
      profile,
      params: DEFAULT_PARAMS,
      input: [{ role: 'user', content: [{ type: 'input_text', text: '只有文字' }] }],
    })

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(String((init as RequestInit).body))
    const userMessage = body.messages.find((message: { role: string }) => message.role === 'user')
    expect(userMessage.content).toBe('只有文字')
  })

  it('streams a multimodal workflow prompt through Chat Completions with one POST', async () => {
    const streamBody = [
      'data: {"id":"chatcmpl_workflow","choices":[{"delta":{"content":"干净"}}]}',
      '',
      'data: {"choices":[{"delta":{"content":"重绘提示词"}}]}',
      '',
      'data: [DONE]',
      '',
    ].join('\n')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(streamBody, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }))
    const profile = createDefaultOpenAIProfile({
      apiKey: 'test-key',
      apiMode: 'chat',
      model: 'gemini-3.1-flash-lite',
      baseUrl: 'https://grsai.dakka.com.cn/v1',
    })

    await expect(callWorkflowPromptApi({
      settings: DEFAULT_SETTINGS,
      profile,
      systemPrompt: '分析参考图并生成去脏重绘提示词',
      userText: '保持主体结构',
      imageDataUrls: ['data:image/png;base64,aGk='],
    })).resolves.toBe('干净重绘提示词')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://grsai.dakka.com.cn/v1/chat/completions')
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(String((init as RequestInit).body))
    expect(body.stream).toBe(true)
    expect(body.messages).toEqual([
      { role: 'system', content: '分析参考图并生成去脏重绘提示词' },
      {
        role: 'user',
        content: [
          { type: 'text', text: '保持主体结构' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,aGk=' } },
        ],
      },
    ])
  })

  it('still accepts a non-streaming workflow response from compatible chat providers', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: '普通响应提示词' } }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    const profile = createDefaultOpenAIProfile({
      apiKey: 'test-key',
      apiMode: 'chat',
      model: 'vision-model',
      baseUrl: 'https://api.example.com/v1',
    })

    await expect(callWorkflowPromptApi({
      settings: DEFAULT_SETTINGS,
      profile,
      systemPrompt: 'system',
      userText: 'user',
    })).resolves.toBe('普通响应提示词')
  })

  it('routes a Grsai Gemini workflow to Chat even when the saved profile says Responses', async () => {
    const streamBody = [
      'data: {"id":"chatcmpl_grsai","choices":[{"delta":{"content":"已纠正端点"}}]}',
      '',
      'data: [DONE]',
      '',
    ].join('\n')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(streamBody, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }))
    const profile = createDefaultOpenAIProfile({
      apiKey: 'test-key',
      apiMode: 'responses',
      model: 'gemini-3.1-flash-lite',
      baseUrl: 'https://grsai.dakka.com.cn/v1',
    })

    await expect(callWorkflowPromptApi({
      settings: DEFAULT_SETTINGS,
      profile,
      systemPrompt: 'system',
      userText: 'user',
      imageDataUrls: ['data:image/webp;base64,aGk='],
    })).resolves.toBe('已纠正端点')

    expect(String(fetchMock.mock.calls[0][0])).toBe('https://grsai.dakka.com.cn/v1/chat/completions')
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
    expect(body.messages[1].content[1]).toEqual({
      type: 'image_url',
      image_url: { url: 'data:image/webp;base64,aGk=' },
    })
    expect(body.input).toBeUndefined()
  })

  it('adds safe workflow diagnostics to upstream errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      error: { message: 'Upstream error: 400' },
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    }))
    const profile = createDefaultOpenAIProfile({
      apiKey: 'secret-must-not-leak',
      apiMode: 'chat',
      model: 'gemini-3.1-flash-lite',
      baseUrl: 'https://grsai.dakka.com.cn/v1',
    })

    await expect(callWorkflowPromptApi({
      settings: DEFAULT_SETTINGS,
      profile,
      systemPrompt: 'system',
      userText: 'user',
      imageDataUrls: ['data:image/webp;base64,aGk='],
    })).rejects.toThrow(/Upstream error: 400\n诊断：接口=chat，状态=HTTP 400，主机=grsai\.dakka\.com\.cn，路径=\/v1\/chat\/completions，模型=gemini-3\.1-flash-lite，图片=1张，图像负载=0\.00 MiB，格式=image\/webp/)
  })

  it('streams a multimodal workflow prompt through Responses with one POST', async () => {
    const streamBody = [
      'data: {"type":"response.output_text.delta","delta":"干净"}',
      '',
      'data: {"type":"response.output_text.delta","delta":"重绘提示词"}',
      '',
      'data: {"type":"response.completed","response":{"id":"resp_workflow","output":[]}}',
      '',
      'data: [DONE]',
      '',
    ].join('\n')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(streamBody, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }))
    const profile = createDefaultOpenAIProfile({
      apiKey: 'test-key',
      apiMode: 'responses',
      model: 'gpt-5.6-sol',
      baseUrl: 'https://api.example.com/v1',
    })

    await expect(callWorkflowPromptApi({
      settings: DEFAULT_SETTINGS,
      profile,
      systemPrompt: '分析参考图并生成去脏重绘提示词',
      userText: '保持主体结构',
      imageDataUrls: ['data:image/png;base64,aGk='],
    })).resolves.toBe('干净重绘提示词')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.example.com/v1/responses')
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(String((init as RequestInit).body))
    expect(body.stream).toBe(true)
    expect(body.input).toEqual([
      {
        role: 'user',
        content: [
          { type: 'input_text', text: '保持主体结构' },
          { type: 'input_image', image_url: 'data:image/png;base64,aGk=' },
        ],
      },
    ])
  })

  it('still accepts a non-streaming workflow response from compatible responses providers', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      id: 'resp_plain',
      output: [{
        type: 'message',
        content: [{ type: 'output_text', text: '普通Responses提示词' }],
      }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    const profile = createDefaultOpenAIProfile({
      apiKey: 'test-key',
      apiMode: 'responses',
      model: 'vision-model',
      baseUrl: 'https://api.example.com/v1',
    })

    await expect(callWorkflowPromptApi({
      settings: DEFAULT_SETTINGS,
      profile,
      systemPrompt: 'system',
      userText: 'user',
    })).resolves.toBe('普通Responses提示词')
  })

  it('generates a conversation title through Chat Completions', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      choices: [{
        message: { role: 'assistant', content: '<title>生成封面</title>' },
      }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    const profile = createDefaultOpenAIProfile({
      apiKey: 'test-key',
      apiMode: 'chat',
      model: 'deepseek-chat',
      baseUrl: 'https://api.deepseek.com',
    })

    const title = await callAgentConversationTitleApi({
      settings: DEFAULT_SETTINGS,
      profile,
      prompt: '帮我做一张封面',
    })

    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.deepseek.com/v1/chat/completions')
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(String((init as RequestInit).body))
    expect(body.messages[0]).toMatchObject({ role: 'system' })
    expect(body.messages[1]).toMatchObject({ role: 'user' })
    expect(body.input).toBeUndefined()
    expect((init as RequestInit).headers).toMatchObject({ 'Content-Type': 'application/json' })
    expect(title).toBe('生成封面')
  })
})
