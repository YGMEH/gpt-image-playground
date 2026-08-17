import type { ApiProfile, AppSettings, CustomProviderDefinition } from '../types'
import { buildApiUrl, readClientDevProxyConfig, shouldUseApiProxy } from './devProxy'
import { getApiErrorMessage } from './imageApiShared'
import { isOpenAICompatibleProvider, normalizeAvailableModels } from './apiProfiles'
import { getGrsaiCatalogModels, isGrsaiCatalogModel } from './grsaiModelCatalog'

export {
  GRSAI_CATALOG_MODELS,
  GRSAI_CHAT_MODELS,
  GRSAI_IMAGE_MODELS,
  getGrsaiCatalogModels,
  isGrsaiCatalogModel,
  isGrsaiChatModel,
  isGrsaiImageModel,
} from './grsaiModelCatalog'

export function isAsyncCustomProvider(provider: CustomProviderDefinition | null | undefined) {
  return Boolean(provider?.poll || provider?.submit.taskIdPath || provider?.editSubmit?.taskIdPath)
}

export function isGrsaiCatalogProvider(settings: AppSettings, profile: ApiProfile) {
  const customProvider = settings.customProviders.find((item) => item.id === profile.provider)
  const haystack = [
    profile.provider,
    profile.name,
    profile.baseUrl,
    customProvider?.id,
    customProvider?.name,
    customProvider?.submit?.path,
    customProvider?.poll?.path,
  ].filter(Boolean).join(' ').toLowerCase()
  return /grsai|dakka\.com\.cn|grsaiapi\.com/.test(haystack)
}

export function canRefreshProviderModels(settings: AppSettings, profile: ApiProfile) {
  if (isGrsaiCatalogProvider(settings, profile)) return true
  if (profile.provider === 'fal') return false
  if (!isOpenAICompatibleProvider(settings, profile.provider)) return false
  const customProvider = settings.customProviders.find((item) => item.id === profile.provider)
  return !isAsyncCustomProvider(customProvider)
}

export function parseProviderModelIds(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return []
  const record = payload as Record<string, unknown>
  const raw = Array.isArray(record.data)
    ? record.data
    : Array.isArray(record.models)
      ? record.models
      : Array.isArray(record.data) ? record.data : []
  const models = raw.map((item) => {
    if (typeof item === 'string') return item.trim()
    if (item && typeof item === 'object') {
      const id = (item as Record<string, unknown>).id
      return typeof id === 'string' ? id.trim() : ''
    }
    return ''
  }).filter(Boolean)
  return normalizeAvailableModels(models) ?? []
}

function extractModelIdsFromUnknown(payload: unknown): string[] {
  if (typeof payload === 'string') return parseImportedModelList(payload)
  if (Array.isArray(payload)) {
    const models = payload.map((item) => {
      if (typeof item === 'string') return item.trim()
      if (item && typeof item === 'object') {
        const id = (item as Record<string, unknown>).id
        return typeof id === 'string' ? id.trim() : ''
      }
      return ''
    }).filter(Boolean)
    return normalizeAvailableModels(models) ?? []
  }
  if (!payload || typeof payload !== 'object') return []

  const record = payload as Record<string, unknown>
  const fromProvider = parseProviderModelIds(record)
  if (fromProvider.length) return fromProvider

  const available = normalizeAvailableModels(record.availableModels) ?? []
  const model = typeof record.model === 'string' ? record.model.trim() : ''
  return normalizeAvailableModels([...available, model]) ?? []
}

export function parseImportedModelList(text: string): string[] {
  const raw = text.trim()
  if (!raw) return []

  try {
    return extractModelIdsFromUnknown(JSON.parse(raw) as unknown)
  } catch {
    // Fall through to delimited plain text.
  }

  const tokens = raw
    .split(/[\s,;|]+/)
    .map((item) => item.trim().replace(/^['"]+|['"]+$/g, ''))
    .filter((item) => item && !/^(data|models|id|object|list)$/i.test(item) && !/^[{}\[\]]+$/.test(item))
  return normalizeAvailableModels(tokens) ?? []
}

export function mergeAvailableModels(...lists: Array<readonly string[] | undefined>) {
  return normalizeAvailableModels(lists.flatMap((list) => list ?? [])) ?? []
}

export function parseGrsaiCatalogHtml(html: string): string[] {
  const names = new Set<string>()
  const copyNameRe = /title="点击复制模型名称">\s*([^<]+?)\s*<\/h3>/gi
  for (const match of html.matchAll(copyNameRe)) {
    const name = match[1]?.trim()
    if (name) names.add(name)
  }
  const headingRe = /<h3\b[^>]*>\s*([a-z0-9][a-z0-9._:-]{1,80})\s*<\/h3>/gi
  for (const match of html.matchAll(headingRe)) {
    const name = match[1]?.trim()
    if (name) names.add(name)
  }
  return normalizeAvailableModels([...names].filter(isGrsaiCatalogModel)) ?? []
}

function getLocalGrsaiCatalogModels(): string[] {
  const models = normalizeAvailableModels(getGrsaiCatalogModels()) ?? []
  if (!models.length) throw new Error('本地 Grsai 模型目录为空')
  return models
}

function describeModelsEndpoint(url: string) {
  let host = 'unknown'
  let path = 'unknown'
  try {
    const endpoint = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
    host = endpoint.hostname || 'unknown'
    path = endpoint.pathname || '/'
  } catch {
    // Keep diagnostics safe if a custom proxy returns a non-URL endpoint.
  }
  return { host, path }
}

function isAbortError(error: unknown) {
  return Boolean(
    error
    && typeof error === 'object'
    && 'name' in error
    && (error as { name?: string }).name === 'AbortError',
  )
}

export function isBrowserNetworkFetchError(error: unknown) {
  if (isAbortError(error) || !(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return error instanceof TypeError
    || error.name === 'TypeError'
    || /failed to fetch|networkerror|load failed|network request failed/.test(message)
}

export function createModelsListNetworkError(url: string) {
  const { host, path } = describeModelsEndpoint(url)
  return new Error(
    `无法从该服务商读取模型列表\n诊断：主机=${host}，路径=${path}。该服务商未允许当前网站的浏览器跨域访问 /v1/models，或网络请求被阻断。可手动填写模型 ID，用「导入列表」粘贴其他客户端拿到的名单，部署自建 API 代理后把 API URL 指向代理（见 README「自建 API 代理」），或请服务商为当前网站开放 CORS。`,
  )
}

export async function fetchProviderModels(settings: AppSettings, profile: ApiProfile): Promise<string[]> {
  if (!canRefreshProviderModels(settings, profile)) {
    throw new Error('当前服务商不支持自动刷新模型，请手动填写模型 ID')
  }
  if (isGrsaiCatalogProvider(settings, profile)) {
    return getLocalGrsaiCatalogModels()
  }
  if (!profile.apiKey.trim()) {
    throw new Error('请先填写 API Key')
  }
  if (!profile.baseUrl.trim() && !shouldUseApiProxy(profile.apiProxy)) {
    throw new Error('请先填写 API URL')
  }

  const url = buildApiUrl(profile.baseUrl, 'models', readClientDevProxyConfig(), shouldUseApiProxy(profile.apiProxy))
  const controller = new AbortController()
  const timeoutMs = Math.max(8, Math.min(profile.timeout || 30, 60)) * 1000
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${profile.apiKey.trim()}`,
      },
      signal: controller.signal,
    })
    const raw = await response.text()
    let payload: unknown = {}
    try {
      payload = raw ? JSON.parse(raw) : {}
    } catch {
      payload = {}
    }
    if (!response.ok) {
      const message = await getApiErrorMessage(new Response(raw, { status: response.status, headers: response.headers }))
      throw new Error(message || `HTTP ${response.status}`)
    }
    const models = parseProviderModelIds(payload)
    if (!models.length) throw new Error('接口未返回模型')
    return models
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error('刷新模型超时')
    }
    if (isBrowserNetworkFetchError(error)) {
      throw createModelsListNetworkError(url)
    }
    throw error instanceof Error ? error : new Error(String(error))
  } finally {
    globalThis.clearTimeout(timer)
  }
}
