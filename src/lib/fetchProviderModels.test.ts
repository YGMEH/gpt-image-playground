import { describe, expect, it, vi } from 'vitest'
import {
  canRefreshProviderModels,
  fetchProviderModels,
  getGrsaiCatalogModels,
  isDeepSeekCatalogProvider,
  isGrsaiCatalogModel,
  isGrsaiChatModel,
  isGrsaiImageModel,
  parseGrsaiCatalogHtml,
  parseProviderModelIds,
} from './fetchProviderModels'
import { getDeepSeekCatalogModels } from './deepseekModelCatalog'
import { createDefaultOpenAIProfile, normalizeSettings } from './apiProfiles'

describe('parseProviderModelIds', () => {
  it('reads OpenAI compatible data.id lists', () => {
    expect(parseProviderModelIds({
      data: [
        { id: 'gpt-image-2' },
        { id: 'gpt-image-1.5' },
        { id: 'gpt-image-2' },
        'nano-banana-2',
        { id: '  ' },
      ],
    })).toEqual(['gpt-image-1.5', 'gpt-image-2', 'nano-banana-2'])
  })

  it('reads models arrays used by some gateways', () => {
    expect(parseProviderModelIds({
      models: ['b-model', 'a-model'],
    })).toEqual(['a-model', 'b-model'])
  })

  it('returns empty when payload has no models', () => {
    expect(parseProviderModelIds({ object: 'list' })).toEqual([])
  })
})

describe('canRefreshProviderModels', () => {
  it('allows OpenAI compatible profiles', () => {
    const settings = normalizeSettings({
      profiles: [createDefaultOpenAIProfile({ apiKey: 'sk-test' })],
    })
    expect(canRefreshProviderModels(settings, settings.profiles[0])).toBe(true)
  })

  it('skips fal and non-Grsai async custom providers', () => {
    const settings = normalizeSettings({
      customProviders: [{
        id: 'custom-other-async',
        name: 'Other Async',
        submit: { path: 'draw/completions', taskIdPath: 'id' },
        poll: { path: 'api/result?id={task_id}', statusPath: 'status', successValues: ['succeeded'] },
      }],
      profiles: [{
        id: 'other',
        name: 'Other',
        provider: 'custom-other-async',
        baseUrl: 'https://example.com/v1',
        apiKey: 'sk-test',
        model: 'gpt-image-2',
        timeout: 300,
        apiMode: 'images',
        codexCli: false,
        apiProxy: false,
      }],
    })
    expect(canRefreshProviderModels(settings, settings.profiles[0])).toBe(false)
  })

  it('allows Grsai catalog providers even when they are async', () => {
    const settings = normalizeSettings({
      customProviders: [{
        id: 'custom-grsai-dakka',
        name: 'Grsai Dakka',
        submit: { path: 'draw/completions', taskIdPath: 'id' },
        poll: { path: 'api/result?id={task_id}', statusPath: 'status', successValues: ['succeeded'] },
      }],
      profiles: [{
        id: 'grsai',
        name: 'Grsai',
        provider: 'custom-grsai-dakka',
        baseUrl: 'https://grsai.dakka.com.cn/v1',
        apiKey: 'sk-test',
        model: 'gpt-image-2',
        timeout: 300,
        apiMode: 'images',
        codexCli: false,
        apiProxy: false,
      }],
    })
    expect(canRefreshProviderModels(settings, settings.profiles[0])).toBe(true)
  })

  it('allows DeepSeek catalog providers without a live network refresh', () => {
    const settings = normalizeSettings({
      profiles: [createDefaultOpenAIProfile({
        name: 'DeepSeek 官网',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        apiMode: 'chat',
      })],
    })
    expect(isDeepSeekCatalogProvider(settings.profiles[0])).toBe(true)
    expect(canRefreshProviderModels(settings, settings.profiles[0])).toBe(true)
  })
})

describe('parseGrsaiCatalogHtml', () => {
  it('keeps both image and chat models', () => {
    expect(isGrsaiImageModel('gpt-image-2-vip')).toBe(true)
    expect(isGrsaiImageModel('nano-banana-2')).toBe(true)
    expect(isGrsaiChatModel('gpt-5.5')).toBe(true)
    expect(isGrsaiChatModel('gemini-3-pro')).toBe(true)
    expect(isGrsaiCatalogModel('gpt-4o')).toBe(false)
    expect(parseGrsaiCatalogHtml(`
      <h3 title="点击复制模型名称">gpt-image-2</h3>
      <h3 title="点击复制模型名称">nano-banana-2</h3>
      <h3 title="点击复制模型名称">gpt-5.5</h3>
      <h3 title="点击复制模型名称">gemini-3-pro</h3>
      <h3 title="点击复制模型名称">gpt-4o</h3>
    `)).toEqual(['gemini-3-pro', 'gpt-5.5', 'gpt-image-2', 'nano-banana-2'])
  })

  it('includes local Grsai chat models in the builtin catalog', () => {
    const models = getGrsaiCatalogModels()
    expect(models).toContain('gpt-image-2')
    expect(models).toContain('nano-banana-2')
    expect(models).toContain('gpt-5.6-sol')
    expect(models).toContain('gemini-3-pro')
    expect(models.filter((id) => isGrsaiChatModel(id)).length).toBeGreaterThanOrEqual(11)
    expect(models.filter((id) => isGrsaiImageModel(id)).length).toBeGreaterThanOrEqual(13)
  })
})

describe('DeepSeek local catalog', () => {
  it('returns the builtin DeepSeek models without calling fetch', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const settings = normalizeSettings({
      profiles: [createDefaultOpenAIProfile({
        name: 'DeepSeek 官网',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        apiMode: 'chat',
      })],
    })

    await expect(fetchProviderModels(settings, settings.profiles[0])).resolves.toEqual(getDeepSeekCatalogModels())
    expect(fetchMock).not.toHaveBeenCalled()
    expect(getDeepSeekCatalogModels()).toEqual([
      'deepseek-chat',
      'deepseek-reasoner',
      'deepseek-v4-flash',
      'deepseek-v4-pro',
    ])
    fetchMock.mockRestore()
  })
})
