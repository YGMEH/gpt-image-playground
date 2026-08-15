import { describe, expect, it } from 'vitest'
import { INSPIRATION_PROMPT_COUNT, INSPIRATION_TAGS, loadInspirationPrompts } from './inspirationSource'
import { INSPIRATION_PROMPTS } from './inspirationPrompts'

describe('inspiration prompts data', () => {
  it('matches the declared count and has unique ids', () => {
    expect(INSPIRATION_PROMPTS).toHaveLength(INSPIRATION_PROMPT_COUNT)
    expect(new Set(INSPIRATION_PROMPTS.map((item) => item.id)).size).toBe(INSPIRATION_PROMPTS.length)
  })

  it('keeps required fields, source attribution and known tags', () => {
    for (const item of INSPIRATION_PROMPTS) {
      expect(item.prompt.trim().length).toBeGreaterThan(0)
      expect(item.title.trim().length).toBeGreaterThan(0)
      expect(item.caseUrl).toMatch(/^https:\/\/github\.com\/jamez-bondos\/awesome-gpt4o-images\//)
      expect(item.tags.length).toBeGreaterThan(0)
      for (const tag of item.tags) expect(INSPIRATION_TAGS).toContain(tag)
      if (item.imageUrl) expect(item.imageUrl).toMatch(/^https:\/\/raw\.githubusercontent\.com\//)
    }
  })

  it('lazily loads the same array and caches it', async () => {
    const first = await loadInspirationPrompts()
    const second = await loadInspirationPrompts()
    expect(first).toBe(INSPIRATION_PROMPTS)
    expect(second).toBe(first)
  })
})