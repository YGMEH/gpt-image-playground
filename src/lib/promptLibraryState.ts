import type { QuickPhrase, SavedPrompt } from '../types'
import { DEFAULT_QUICK_PHRASES } from '../types'

export const SAVED_PROMPT_TITLE_MAX_LENGTH = 40
export const SAVED_PROMPT_CONTENT_MAX_LENGTH = 6000
export const QUICK_PHRASE_LABEL_MAX_LENGTH = 12
export const QUICK_PHRASE_TEXT_MAX_LENGTH = 200
export const SAVED_PROMPT_TAG_MAX_LENGTH = 16
export const SAVED_PROMPT_MAX_TAGS = 5

export type SavedPromptSort = 'recent' | 'used' | 'title'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizeSingleLine(value: string, maxLength: number) {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

export function normalizePromptTitle(value: string) {
  return normalizeSingleLine(value, SAVED_PROMPT_TITLE_MAX_LENGTH)
}

export function normalizePromptContent(value: string) {
  // 保留换行，仅去掉首尾空白并限制长度，避免把用户排版好的长提示词压成一行。
  return value.replace(/\r\n/g, '\n').trim().slice(0, SAVED_PROMPT_CONTENT_MAX_LENGTH)
}

export function normalizePromptTags(value: unknown) {
  if (!Array.isArray(value)) return []
  const tags: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const tag = normalizeSingleLine(item, SAVED_PROMPT_TAG_MAX_LENGTH)
    if (!tag || tags.includes(tag)) continue
    tags.push(tag)
    if (tags.length >= SAVED_PROMPT_MAX_TAGS) break
  }
  return tags
}

/** 从提示词正文推导一个可用标题：取首行前若干字。 */
export function derivePromptTitle(content: string) {
  const firstLine = content.split('\n').map((line) => line.trim()).find(Boolean) ?? ''
  const title = normalizePromptTitle(firstLine)
  return title || '未命名提示词'
}

export function normalizeSavedPrompt(value: unknown, now = Date.now()): SavedPrompt | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || !value.id.trim()) return null
  const content = normalizePromptContent(typeof value.content === 'string' ? value.content : '')
  if (!content) return null
  const title = normalizePromptTitle(typeof value.title === 'string' ? value.title : '') || derivePromptTitle(content)
  const createdAt = typeof value.createdAt === 'number' && Number.isFinite(value.createdAt) ? value.createdAt : now
  const updatedAt = typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt) ? value.updatedAt : createdAt
  const useCount = typeof value.useCount === 'number' && Number.isFinite(value.useCount) && value.useCount > 0
    ? Math.floor(value.useCount)
    : 0
  return {
    id: value.id,
    title,
    content,
    tags: normalizePromptTags(value.tags),
    createdAt,
    updatedAt,
    useCount,
    ...(typeof value.sourceId === 'string' && value.sourceId ? { sourceId: value.sourceId } : {}),
    ...(typeof value.sourceUrl === 'string' && value.sourceUrl ? { sourceUrl: value.sourceUrl } : {}),
    ...(typeof value.sourceAuthor === 'string' && value.sourceAuthor ? { sourceAuthor: value.sourceAuthor } : {}),
  }
}

export function normalizeSavedPrompts(value: unknown, now = Date.now()): SavedPrompt[] {
  if (!Array.isArray(value)) return []
  const prompts: SavedPrompt[] = []
  const ids = new Set<string>()
  for (const item of value) {
    const prompt = normalizeSavedPrompt(item, now)
    if (!prompt || ids.has(prompt.id)) continue
    ids.add(prompt.id)
    prompts.push(prompt)
  }
  return prompts
}

export function normalizeQuickPhrase(value: unknown, now = Date.now()): QuickPhrase | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || !value.id.trim()) return null
  const text = normalizeSingleLine(typeof value.text === 'string' ? value.text : '', QUICK_PHRASE_TEXT_MAX_LENGTH)
  if (!text) return null
  const label = normalizeSingleLine(typeof value.label === 'string' ? value.label : '', QUICK_PHRASE_LABEL_MAX_LENGTH)
    || text.slice(0, QUICK_PHRASE_LABEL_MAX_LENGTH)
  const createdAt = typeof value.createdAt === 'number' && Number.isFinite(value.createdAt) ? value.createdAt : now
  const updatedAt = typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt) ? value.updatedAt : createdAt
  return { id: value.id, label, text, createdAt, updatedAt }
}

export function createDefaultQuickPhrases(now = Date.now()): QuickPhrase[] {
  return DEFAULT_QUICK_PHRASES.map((phrase) => ({ ...phrase, createdAt: now, updatedAt: now }))
}

/**
 * 归一化快捷短语列表。
 * 传入 undefined（旧版本数据里没有这个字段）时给出内置默认值；
 * 传入空数组表示用户手动删空了，尊重用户选择不再回填。
 */
export function normalizeQuickPhrases(value: unknown, now = Date.now()): QuickPhrase[] {
  if (!Array.isArray(value)) return createDefaultQuickPhrases(now)
  const phrases: QuickPhrase[] = []
  const ids = new Set<string>()
  for (const item of value) {
    const phrase = normalizeQuickPhrase(item, now)
    if (!phrase || ids.has(phrase.id)) continue
    ids.add(phrase.id)
    phrases.push(phrase)
  }
  return phrases
}

export interface CreateSavedPromptInput {
  title?: string
  content: string
  tags?: string[]
  sourceId?: string
  sourceUrl?: string
  sourceAuthor?: string
}

export function createSavedPrompt(input: CreateSavedPromptInput, id: string, now = Date.now()): SavedPrompt | null {
  const content = normalizePromptContent(input.content)
  if (!content) return null
  return {
    id,
    title: normalizePromptTitle(input.title ?? '') || derivePromptTitle(content),
    content,
    tags: normalizePromptTags(input.tags),
    createdAt: now,
    updatedAt: now,
    useCount: 0,
    ...(input.sourceId ? { sourceId: input.sourceId } : {}),
    ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
    ...(input.sourceAuthor ? { sourceAuthor: input.sourceAuthor } : {}),
  }
}

export function findSavedPromptByContent(prompts: SavedPrompt[], content: string) {
  const normalized = normalizePromptContent(content)
  if (!normalized) return null
  return prompts.find((prompt) => prompt.content === normalized) ?? null
}

export function updateSavedPrompt(
  prompts: SavedPrompt[],
  id: string,
  patch: Partial<Pick<SavedPrompt, 'title' | 'content' | 'tags'>>,
  now = Date.now(),
): SavedPrompt[] {
  return prompts.map((prompt) => {
    if (prompt.id !== id) return prompt
    const content = patch.content != null ? normalizePromptContent(patch.content) : prompt.content
    if (!content) return prompt
    const title = patch.title != null
      ? normalizePromptTitle(patch.title) || derivePromptTitle(content)
      : prompt.title
    const tags = patch.tags != null ? normalizePromptTags(patch.tags) : prompt.tags
    if (content === prompt.content && title === prompt.title && sameTags(tags, prompt.tags)) return prompt
    return { ...prompt, title, content, tags, updatedAt: now }
  })
}

function sameTags(a: string[], b: string[]) {
  return a.length === b.length && a.every((tag, index) => tag === b[index])
}

export function markSavedPromptUsed(prompts: SavedPrompt[], id: string): SavedPrompt[] {
  return prompts.map((prompt) => (prompt.id === id ? { ...prompt, useCount: prompt.useCount + 1 } : prompt))
}

export function collectSavedPromptTags(prompts: SavedPrompt[]) {
  const counts = new Map<string, number>()
  for (const prompt of prompts) {
    for (const tag of prompt.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0], 'zh-Hans-CN'))
    .map(([tag]) => tag)
}

export function filterSavedPrompts(
  prompts: SavedPrompt[],
  options: { query?: string; tag?: string | null; sort?: SavedPromptSort } = {},
): SavedPrompt[] {
  const query = (options.query ?? '').trim().toLowerCase()
  const tag = options.tag ?? null
  const filtered = prompts.filter((prompt) => {
    if (tag && !prompt.tags.includes(tag)) return false
    if (!query) return true
    return prompt.title.toLowerCase().includes(query)
      || prompt.content.toLowerCase().includes(query)
      || prompt.tags.some((item) => item.toLowerCase().includes(query))
  })

  const sort = options.sort ?? 'recent'
  return [...filtered].sort((a, b) => {
    if (sort === 'used' && a.useCount !== b.useCount) return b.useCount - a.useCount
    if (sort === 'title') return a.title.localeCompare(b.title, 'zh-Hans-CN')
    return b.updatedAt - a.updatedAt
  })
}

/** 把一段文本按「追加」语义合并到当前提示词，避免粘连和重复。 */
export function appendPromptText(prompt: string, text: string) {
  const addition = text.trim()
  if (!addition) return prompt
  const base = prompt.replace(/\s+$/, '')
  if (!base) return addition
  if (base.includes(addition)) return base
  const separator = /[。！？.!?，,、;；]$/.test(base) ? '' : '，'
  return `${base}${separator}${addition}`
}
