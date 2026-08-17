import { describe, expect, it, vi } from 'vitest'
import {
  canRefreshProviderModels,
  createModelsListNetworkError,
  fetchProviderModels,
  getGrsaiCatalogModels,
  isBrowserNetworkFetchError,
  isGrsaiCatalogModel,
  isGrsaiChatModel,
  isGrsaiImageModel,
  mergeAvailableModels,
  parseGrsaiCatalogHtml,
  parseImportedModelList,
  parseProviderModelIds,
} from './fetchProviderModels'
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

describe('parseImportedModelList', () => {
  it('reads OpenAI compatible JSON copied from another client', () => {
    expect(parseImportedModelList(JSON.stringify({
      data: [{ id: 'gpt-5.6-sol' }, { id: 'gpt-5.6-terra' }],
    }))).toEqual(['gpt-5.6-sol', 'gpt-5.6-terra'])
  })

  it('reads newline or comma separated model IDs', () => {
    expect(parseImportedModelList('gpt-5.6-sol\ngpt-4o-mini, nano-banana-2')).toEqual([
      'gpt-4o-mini',
      'gpt-5.6-sol',
      'nano-banana-2',
    ])
  })

  it('reads exported settings objects and models arrays', () => {
    expect(parseImportedModelList(JSON.stringify({
      availableModels: ['gpt-5.6-sol'],
      model: 'gpt-4o-mini',
    }))).toEqual(['gpt-4o-mini', 'gpt-5.6-sol'])
    expect(parseImportedModelList(JSON.stringify({
      models: ['provider/gpt-5.6-sol:latest', 'nano-banana-2'],
    }))).toEqual(['nano-banana-2', 'provider/gpt-5.6-sol:latest'])
  })

  it('ignores empty text, invalid JSON wrappers, and list metadata tokens', () => {
    expect(parseImportedModelList('')).toEqual([])
    expect(parseImportedModelList('   ')).toEqual([])
    expect(parseImportedModelList('{ "object": "list" }')).toEqual([])
    expect(parseImportedModelList('data\nmodels\nid\nobject\nlist')).toEqual([])
  })

  it('merges current and imported model lists without duplicates', () => {
    expect(mergeAvailableModels(['gpt-5.6-sol'], ['gpt-5.6-sol', 'gpt-4o-mini'])).toEqual([
      'gpt-4o-mini',
      'gpt-5.6-sol',
    ])
    expect(mergeAvailableModels(undefined, [], ['nano-banana-2'])).toEqual(['nano-banana-2'])
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

  it('treats OpenAI-compatible chat providers as refreshable via the network', () => {
    const settings = normalizeSettings({
      profiles: [createDefaultOpenAIProfile({
        name: '自定义文本',
        baseUrl: 'https://api.example.com',
        model: 'gpt-4o-mini',
        apiMode: 'chat',
        apiKey: 'sk-test',
      })],
    })
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

function createOpenAICompatibleSettings(baseUrl = 'https://api.example.com') {
  return normalizeSettings({
    profiles: [createDefaultOpenAIProfile({
      name: '自定义文本',
      baseUrl,
      model: 'gpt-4o-mini',
      apiMode: 'chat',
      apiKey: 'sk-test',
    })],
  })
}

describe('network model refresh', () => {
  it('requests /models for OpenAI-compatible providers and parses the list', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 'gpt-4o-mini' }, { id: 'gpt-4o' }] }), { status: 200 }),
    )
    const settings = createOpenAICompatibleSettings()

    await expect(fetchProviderModels(settings, settings.profiles[0])).resolves.toEqual(['gpt-4o', 'gpt-4o-mini'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.example.com/v1/models')
    fetchMock.mockRestore()
  })

  it('maps browser Failed to fetch to a CORS-or-network models-list hint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    const settings = createOpenAICompatibleSettings('https://api.starwish.fit')

    await expect(fetchProviderModels(settings, settings.profiles[0])).rejects.toThrow(
      /无法从该服务商读取模型列表\n诊断：主机=api\.starwish\.fit，路径=\/v1\/models。该服务商未允许当前网站的浏览器跨域访问 \/v1\/models[\s\S]*导入列表[\s\S]*自建 API 代理/,
    )
    fetchMock.mockRestore()
  })

  it('keeps AbortError as a timeout instead of a CORS hint', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortError)
    const settings = createOpenAICompatibleSettings()

    await expect(fetchProviderModels(settings, settings.profiles[0])).rejects.toThrow('刷新模型超时')
    fetchMock.mockRestore()
  })

  it('keeps HTTP error text from the provider', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'API_KEY_REQUIRED' } }), { status: 401 }),
    )
    const settings = createOpenAICompatibleSettings()

    await expect(fetchProviderModels(settings, settings.profiles[0])).rejects.toThrow('API_KEY_REQUIRED')
    fetchMock.mockRestore()
  })
})

describe('browser network fetch classification', () => {
  it('treats Failed to fetch as a browser network failure', () => {
    expect(isBrowserNetworkFetchError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isBrowserNetworkFetchError(new DOMException('The operation was aborted.', 'AbortError'))).toBe(false)
  })

  it('describes the sanitized models endpoint without leaking the full URL', () => {
    expect(createModelsListNetworkError('https://api.starwish.fit/v1/models?secret=1').message).toBe(
      '无法从该服务商读取模型列表\n诊断：主机=api.starwish.fit，路径=/v1/models。该服务商未允许当前网站的浏览器跨域访问 /v1/models，或网络请求被阻断。可手动填写模型 ID，用「导入列表」粘贴其他客户端拿到的名单，部署自建 API 代理后把 API URL 指向代理（见 README「自建 API 代理」），或请服务商为当前网站开放 CORS。',
    )
  })
})
