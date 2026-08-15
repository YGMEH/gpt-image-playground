import { describe, expect, it } from 'vitest'
import {
  appendPromptText,
  collectSavedPromptTags,
  createDefaultQuickPhrases,
  createSavedPrompt,
  derivePromptTitle,
  filterSavedPrompts,
  findSavedPromptByContent,
  markSavedPromptUsed,
  normalizePromptTags,
  normalizeQuickPhrases,
  normalizeSavedPrompts,
  updateSavedPrompt,
} from './promptLibraryState'
import type { SavedPrompt } from '../types'

function makePrompt(overrides: Partial<SavedPrompt> = {}): SavedPrompt {
  return {
    id: overrides.id ?? 'p1',
    title: overrides.title ?? '标题',
    content: overrides.content ?? '正文',
    tags: overrides.tags ?? [],
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
    useCount: overrides.useCount ?? 0,
    ...(overrides.sourceId ? { sourceId: overrides.sourceId } : {}),
    ...(overrides.sourceUrl ? { sourceUrl: overrides.sourceUrl } : {}),
    ...(overrides.sourceAuthor ? { sourceAuthor: overrides.sourceAuthor } : {}),
  }
}

describe('normalizeSavedPrompts', () => {
  it('drops invalid entries and duplicate ids', () => {
    const prompts = normalizeSavedPrompts([
      { id: 'a', content: '内容 A', title: '标题 A' },
      { id: 'a', content: '重复 id' },
      { id: 'b', content: '   ' },
      { id: '', content: '缺少 id' },
      null,
      { id: 'c', content: '内容 C' },
    ], 100)
    expect(prompts.map((prompt) => prompt.id)).toEqual(['a', 'c'])
  })

  it('derives title from content and keeps line breaks', () => {
    const [prompt] = normalizeSavedPrompts([{ id: 'a', content: '  第一行\n第二行  ' }], 100)
    expect(prompt.title).toBe('第一行')
    expect(prompt.content).toBe('第一行\n第二行')
    expect(prompt.createdAt).toBe(100)
    expect(prompt.updatedAt).toBe(100)
    expect(prompt.useCount).toBe(0)
  })

  it('keeps source attribution fields', () => {
    const [prompt] = normalizeSavedPrompts([{
      id: 'a',
      content: '内容',
      sourceId: 'awgi-1',
      sourceUrl: 'https://example.com/case',
      sourceAuthor: '@someone',
    }], 100)
    expect(prompt.sourceId).toBe('awgi-1')
    expect(prompt.sourceUrl).toBe('https://example.com/case')
    expect(prompt.sourceAuthor).toBe('@someone')
  })
})

describe('normalizePromptTags', () => {
  it('trims, dedupes and caps tag count', () => {
    expect(normalizePromptTags([' 人像 ', '人像', '3D', 1, '', 'a', 'b', 'c', 'd'])).toEqual(['人像', '3D', 'a', 'b', 'c'])
  })
})

describe('derivePromptTitle', () => {
  it('falls back to a placeholder when content has no usable line', () => {
    expect(derivePromptTitle('\n\n')).toBe('未命名提示词')
  })
})

describe('normalizeQuickPhrases', () => {
  it('returns built-in phrases when the field is missing', () => {
    const phrases = normalizeQuickPhrases(undefined, 5)
    expect(phrases.length).toBeGreaterThan(0)
    expect(phrases).toEqual(createDefaultQuickPhrases(5))
  })

  it('respects an explicitly emptied list', () => {
    expect(normalizeQuickPhrases([], 5)).toEqual([])
  })

  it('falls back to the text when a label is missing', () => {
    const [phrase] = normalizeQuickPhrases([{ id: 'q1', text: '这是一段比标签上限更长的快捷短语文本' }], 5)
    expect(phrase.label).toBe('这是一段比标签上限更长的')
    expect(phrase.text).toBe('这是一段比标签上限更长的快捷短语文本')
  })
})

describe('createSavedPrompt', () => {
  it('returns null for blank content', () => {
    expect(createSavedPrompt({ content: '   \n ' }, 'id', 1)).toBeNull()
  })

  it('normalizes title and tags', () => {
    const prompt = createSavedPrompt({ title: '  我的  提示词 ', content: ' 内容 ', tags: ['写实', '写实'] }, 'id', 7)
    expect(prompt).toMatchObject({ id: 'id', title: '我的 提示词', content: '内容', tags: ['写实'], createdAt: 7, updatedAt: 7 })
  })
})

describe('updateSavedPrompt', () => {
  it('bumps updatedAt only when something actually changed', () => {
    const prompts = [makePrompt({ id: 'a', title: '旧', content: '旧内容', updatedAt: 1 })]
    const unchanged = updateSavedPrompt(prompts, 'a', { title: '旧', content: '旧内容' }, 50)
    expect(unchanged[0]).toBe(prompts[0])

    const changed = updateSavedPrompt(prompts, 'a', { content: '新内容' }, 50)
    expect(changed[0].content).toBe('新内容')
    expect(changed[0].updatedAt).toBe(50)
  })

  it('ignores an update that would blank the content', () => {
    const prompts = [makePrompt({ id: 'a', content: '有内容' })]
    expect(updateSavedPrompt(prompts, 'a', { content: '  ' }, 50)[0]).toBe(prompts[0])
  })
})

describe('filterSavedPrompts', () => {
  const prompts = [
    makePrompt({ id: 'a', title: '海报', content: '一张海报', tags: ['平面'], updatedAt: 3, useCount: 1 }),
    makePrompt({ id: 'b', title: '人像', content: '写实人像特写', tags: ['人像'], updatedAt: 1, useCount: 9 }),
    makePrompt({ id: 'c', title: 'Chibi', content: 'Q版角色', tags: ['人像'], updatedAt: 2, useCount: 0 }),
  ]

  it('sorts by recent update by default', () => {
    expect(filterSavedPrompts(prompts).map((p) => p.id)).toEqual(['a', 'c', 'b'])
  })

  it('sorts by use count', () => {
    expect(filterSavedPrompts(prompts, { sort: 'used' }).map((p) => p.id)).toEqual(['b', 'a', 'c'])
  })

  it('filters by tag and query across title, content and tags', () => {
    expect(filterSavedPrompts(prompts, { tag: '人像' }).map((p) => p.id)).toEqual(['c', 'b'])
    expect(filterSavedPrompts(prompts, { query: '写实' }).map((p) => p.id)).toEqual(['b'])
    expect(filterSavedPrompts(prompts, { query: 'chibi' }).map((p) => p.id)).toEqual(['c'])
    expect(filterSavedPrompts(prompts, { query: '平面' }).map((p) => p.id)).toEqual(['a'])
  })
})

describe('markSavedPromptUsed', () => {
  it('increases the use count of the matching prompt only', () => {
    const prompts = [makePrompt({ id: 'a', useCount: 2 }), makePrompt({ id: 'b', useCount: 0 })]
    const next = markSavedPromptUsed(prompts, 'a')
    expect(next[0].useCount).toBe(3)
    expect(next[1]).toBe(prompts[1])
  })
})

describe('findSavedPromptByContent', () => {
  it('matches ignoring surrounding whitespace', () => {
    const prompts = [makePrompt({ id: 'a', content: '一样的内容' })]
    expect(findSavedPromptByContent(prompts, '  一样的内容 \n')?.id).toBe('a')
    expect(findSavedPromptByContent(prompts, '不同')).toBeNull()
    expect(findSavedPromptByContent(prompts, '   ')).toBeNull()
  })
})

describe('collectSavedPromptTags', () => {
  it('orders tags by usage count', () => {
    const prompts = [
      makePrompt({ id: 'a', tags: ['人像', '平面'] }),
      makePrompt({ id: 'b', tags: ['人像'] }),
    ]
    expect(collectSavedPromptTags(prompts)).toEqual(['人像', '平面'])
  })
})

describe('appendPromptText', () => {
  it('appends with a separator and avoids duplicates', () => {
    expect(appendPromptText('', '高细节')).toBe('高细节')
    expect(appendPromptText('一只猫', '高细节')).toBe('一只猫，高细节')
    expect(appendPromptText('一只猫。', '高细节')).toBe('一只猫。高细节')
    expect(appendPromptText('一只猫，高细节', '高细节')).toBe('一只猫，高细节')
    expect(appendPromptText('一只猫  ', '  高细节 ')).toBe('一只猫，高细节')
    expect(appendPromptText('一只猫', '   ')).toBe('一只猫')
  })
})
