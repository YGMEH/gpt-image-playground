import type { ApiMode } from '../types'

export const GRSAI_IMAGE_MODELS = [
  'gpt-image-2',
  'gpt-image-2-vip',
  'gpt-image-2.5',
  'gpt-image-2.5-flare',
  'gpt-image-2.5-sunburst',
  'nano-banana',
  'nano-banana-2',
  'nano-banana-2.1',
  'nano-banana-2-cl',
  'nano-banana-2-2k-cl',
  'nano-banana-2-4k-cl',
  'nano-banana-2-lite',
  'nano-banana-fast',
  'nano-banana-pro',
  'nano-banana-pro-4k-vip',
  'nano-banana-pro-cl',
  'nano-banana-pro-vip',
  'nano-banana-pro-vt',
] as const

export const GRSAI_CHAT_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-3-flash',
  'gemini-3-pro',
  'gemini-3.1-flash-lite',
  'gemini-3.1-pro',
  'gemini-3.5-flash',
  'gpt-5.4',
  'gpt-5.5',
  'gpt-5.6-sol',
  'gpt-5.6-terra',
] as const

export const GRSAI_CATALOG_MODELS = [
  ...GRSAI_IMAGE_MODELS,
  ...GRSAI_CHAT_MODELS,
] as const

export function isGrsaiImageModel(id: string) {
  return /^(gpt-image|nano-banana)(-|$)/i.test(id.trim())
}

export function isGrsaiChatModel(id: string) {
  return /^(gpt-5|gemini)([-.]|$)/i.test(id.trim())
}

export function isGrsaiCatalogModel(id: string) {
  return isGrsaiImageModel(id) || isGrsaiChatModel(id)
}

/** 按接口模式返回可用模型：生图与文本模型不能混用，未指定模式时返回完整目录。 */
export function getGrsaiCatalogModels(apiMode?: ApiMode) {
  if (apiMode === 'chat' || apiMode === 'responses') return [...GRSAI_CHAT_MODELS]
  if (apiMode === 'images') return [...GRSAI_IMAGE_MODELS]
  return [...GRSAI_CATALOG_MODELS]
}
