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
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('刷新模型超时')
    }
    throw error instanceof Error ? error : new Error(String(error))
  } finally {
    globalThis.clearTimeout(timer)
  }
}
