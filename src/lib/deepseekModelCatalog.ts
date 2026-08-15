export const DEEPSEEK_CHAT_MODELS = [
  'deepseek-chat',
  'deepseek-reasoner',
  'deepseek-v4-flash',
  'deepseek-v4-pro',
] as const

export const DEFAULT_CHAT_MODEL = 'deepseek-chat'
export const DEEPSEEK_OFFICIAL_BASE_URL = 'https://api.deepseek.com'
export const DEEPSEEK_LOCAL_PROXY_PREFIX = '/deepseek-proxy'

export function isDeepSeekCatalogModel(id: string) {
  return /^(deepseek-(chat|reasoner)|deepseek-v4-(flash|pro))$/i.test(id.trim())
}

export function isDeepSeekOfficialEndpoint(value: string) {
  return /api\.deepseek\.com/i.test(value) || /(^|\/)deepseek-proxy(\/|$)/i.test(value)
}

export function allowsEmptyDeepSeekApiKey(profile: { id?: string; baseUrl?: string; name?: string }) {
  if (profile.id === 'deepseek-official') return true
  return isDeepSeekOfficialEndpoint([profile.baseUrl, profile.name].filter(Boolean).join(' '))
}

export function getDeepSeekCatalogModels() {
  return [...DEEPSEEK_CHAT_MODELS]
}
