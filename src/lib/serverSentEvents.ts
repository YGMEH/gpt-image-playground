export interface ReadJsonServerSentEventsOptions {
  signals?: Array<AbortSignal | undefined>
  formatErrorMessage?: (message: string) => string
  getEventErrorMessage?: (event: Record<string, unknown>) => string | null
}
export function isEventStreamResponse(response: Response): boolean {
  return response.headers.get('Content-Type')?.toLowerCase().includes('text/event-stream') ?? false
}

/**
 * 部分 OpenAI 兼容中转站会返回 `data: {...}`，但错误地标成 application/json。
 * 使用 clone 探测正文，避免消费调用方后续真正要读取的响应流。
 */
export async function isJsonServerSentEventResponse(response: Response): Promise<boolean> {
  if (isEventStreamResponse(response)) return true
  try {
    const text = await response.clone().text()
    return /(?:^|\r?\n)data\s*:/.test(text.trimStart())
  } catch {
    return false
  }
}

/** 读取普通 JSON，或读取被 `data:` 包装的单个/多个 JSON 事件并返回最后一个事件。 */
export async function readJsonOrServerSentEventResponse(response: Response): Promise<unknown> {
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch (jsonError) {
    const blocks = text.split(/\r?\n\r?\n/)
    const events: unknown[] = []
    for (const block of blocks) {
      const data = parseServerSentEventBlock(block)
      if (!data) continue
      try {
        events.push(JSON.parse(data))
      } catch {
        // 保留原始 JSON 错误，避免把 HTML/纯文本错误误报成 SSE。
      }
    }
    if (events.length > 0) return events[events.length - 1]
    throw jsonError
  }
}


export function parseServerSentEventBlock(block: string): string | null {
  const dataLines: string[] = []
  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue
    if (!line.startsWith('data:')) continue
    dataLines.push(line.slice(5).replace(/^ /, ''))
  }

  const data = dataLines.join('\n').trim()
  if (!data || data === '[DONE]') return null
  return data
}

export function throwIfAborted(...signals: Array<AbortSignal | undefined>) {
  const signal = signals.find((signal) => signal?.aborted)
  if (!signal) return
  throw signal.reason instanceof Error ? signal.reason : new DOMException('请求已停止', 'AbortError')
}

export async function readJsonServerSentEvents(
  response: Response,
  onEvent: (event: Record<string, unknown>) => void | Promise<void>,
  options: ReadJsonServerSentEventsOptions = {},
): Promise<void> {
  if (!response.body) throw new Error('接口未返回可读取的流式响应')

  const signals = options.signals ?? []
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let hasDataLine = false
  const cancelReader = () => {
    void reader.cancel().catch(() => undefined)
  }
  throwIfAborted(...signals)
  for (const signal of signals) signal?.addEventListener('abort', cancelReader, { once: true })

  const processBlock = async (block: string) => {
    if (block.split(/\r?\n/).some((line) => line.startsWith('data:'))) hasDataLine = true
    const data = parseServerSentEventBlock(block)
    if (!data) return

    let event: unknown
    try {
      event = JSON.parse(data)
    } catch {
      throw new Error(options.formatErrorMessage?.(data) ?? data)
    }
    if (!event || typeof event !== 'object' || Array.isArray(event)) return

    const errorMessage = options.getEventErrorMessage?.(event as Record<string, unknown>)
    if (errorMessage) throw new Error(errorMessage)

    throwIfAborted(...signals)
    await onEvent(event as Record<string, unknown>)
    throwIfAborted(...signals)
  }

  try {
    while (true) {
      throwIfAborted(...signals)
      const { value, done } = await reader.read()
      throwIfAborted(...signals)
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let separatorIndex = buffer.search(/\r?\n\r?\n/)
      while (separatorIndex >= 0) {
        const block = buffer.slice(0, separatorIndex)
        const separator = buffer.match(/\r?\n\r?\n/)?.[0] ?? '\n\n'
        buffer = buffer.slice(separatorIndex + separator.length)
        await processBlock(block)
        separatorIndex = buffer.search(/\r?\n\r?\n/)
      }
    }

    buffer += decoder.decode()
    throwIfAborted(...signals)
    if (buffer.trim()) await processBlock(buffer)
    if (!hasDataLine) {
      const message = '未从流式响应中解析到有效的 data 事件'
      throw new Error(options.formatErrorMessage?.(message) ?? message)
    }
  } finally {
    for (const signal of signals) signal?.removeEventListener('abort', cancelReader)
  }
}
