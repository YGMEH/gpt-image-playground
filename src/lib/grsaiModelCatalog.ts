export const GRSAI_IMAGE_MODELS = [
  'gpt-image-2',
  'gpt-image-2-vip',
  'nano-banana-2',
  'nano-banana-2-2k-cl',
  'nano-banana-2-4k-cl',
  'nano-banana-2-cl',
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

export function getGrsaiCatalogModels() {
  return [...GRSAI_CATALOG_MODELS]
}
