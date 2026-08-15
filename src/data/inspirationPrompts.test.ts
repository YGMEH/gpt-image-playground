import { describe, expect, it } from 'vitest'
import {
  INSPIRATION_PROMPT_COUNT,
  INSPIRATION_TAGS,
  getInspirationOriginalUrls,
  getInspirationThumbUrl,
  getInspirationThumbUrls,
  loadInspirationPrompts,
} from './inspirationSource'
import { INSPIRATION_PROMPTS } from './inspirationPrompts'

/** public/inspiration 下的内置缩略图清单（构建期静态展开） */
const thumbModules = import.meta.glob('../../public/inspiration/*.webp')
const thumbNames = new Set(Object.keys(thumbModules).map((path) => path.split('/').pop()))

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
      if (item.imageUrl) expect(item.imageUrl).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/gh\/jamez-bondos\/awesome-gpt4o-images@main\//)
    }
  })

  it('lazily loads the same array and caches it', async () => {
    const first = await loadInspirationPrompts()
    const second = await loadInspirationPrompts()
    expect(first).toBe(INSPIRATION_PROMPTS)
    expect(second).toBe(first)
  })

  it('ships a local webp thumbnail for every case', () => {
    expect(thumbNames.size).toBe(INSPIRATION_PROMPT_COUNT)
    for (const item of INSPIRATION_PROMPTS) {
      expect(thumbNames.has(`${item.id}.webp`)).toBe(true)
      expect(getInspirationThumbUrl(item.id)).toContain(`inspiration/${item.id}.webp`)
    }
  })

  it('builds thumbnail and original url fallbacks in priority order', () => {
    const withImage = INSPIRATION_PROMPTS.find((item) => item.imageUrl)
    expect(withImage).toBeDefined()
    if (!withImage) return

    const originals = getInspirationOriginalUrls(withImage)
    expect(originals[0]).toBe(withImage.imageUrl)
    expect(originals[1]).toMatch(/^https:\/\/raw\.githubusercontent\.com\/jamez-bondos\/awesome-gpt4o-images\/main\//)

    const thumbs = getInspirationThumbUrls(withImage)
    expect(thumbs[0]).toBe(getInspirationThumbUrl(withImage.id))
    expect(thumbs.slice(1)).toEqual(originals)

    expect(getInspirationOriginalUrls({ ...withImage, imageUrl: undefined })).toEqual([])
  })
})