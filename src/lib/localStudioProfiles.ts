import type { ApiProfile, AppSettings, CustomProviderDefinition } from '../types'
import {
  DEFAULT_API_TIMEOUT,
  DEFAULT_IMAGES_MODEL,
  DEFAULT_OPENAI_PROFILE_ID,
  normalizeSettings,
} from './apiProfiles'
import { GRSAI_IMAGE_MODELS } from './grsaiModelCatalog'
import { readRuntimeEnv } from './runtimeEnv'

export const LOCAL_GRSAI_PROVIDER_ID = 'custom-grsai-dakka'
export const LOCAL_GRSAI_PROFILE_ID = 'grsai-dakka-default'
export const LOCAL_CHANSHUI_PROFILE_ID = 'chanshui-text'
export const LOCAL_GRSAI_BASE_URL = 'https://grsai.dakka.com.cn/v1'
export const LOCAL_CHANSHUI_BASE_URL = 'https://cssmapi.fun/v1'

function readLocalKey(value: string | undefined) {
  return readRuntimeEnv(value)
}

export function createLocalGrsaiProvider(): CustomProviderDefinition {
  return {
    id: LOCAL_GRSAI_PROVIDER_ID,
    name: 'Grsai Dakka',
    template: 'http-image',
    defaultBaseUrl: LOCAL_GRSAI_BASE_URL,
    defaultModels: [...GRSAI_IMAGE_MODELS],
    submit: {
      // Grsai 原生协议：aspectRatio + imageSize + replyType=async，参考图走 images（base64 data URI）。
      path: 'api/generate',
      method: 'POST',
      contentType: 'json',
      body: {
        model: '$profile.model',
        prompt: '$prompt',
        aspectRatio: '$size.ratio',
        imageSize: '$size.tier',
        images: '$inputImages.dataUrls',
        replyType: 'async',
      },
      taskIdPath: 'id',
      result: {
        imageUrlPaths: ['results.*.url'],
        b64JsonPaths: [],
      },
    },
    poll: {
      path: 'api/result?id={task_id}',
      method: 'GET',
      intervalSeconds: 3,
      statusPath: 'status',
      successValues: ['succeeded'],
      failureValues: ['failed', 'violation', 'error'],
      errorPath: 'error',
      result: {
        imageUrlPaths: ['results.*.url'],
        b64JsonPaths: [],
      },
    },
  }
}

export function createLocalStudioProfiles(): ApiProfile[] {
  const grsaiKey = readLocalKey(import.meta.env.VITE_GRSAI_DAKKA_API_KEY)
  const chanshuiKey = readLocalKey(import.meta.env.VITE_CHANSHUI_API_KEY)

  return [
    {
      id: LOCAL_GRSAI_PROFILE_ID,
      name: 'Grsai Dakka',
      provider: LOCAL_GRSAI_PROVIDER_ID,
      baseUrl: LOCAL_GRSAI_BASE_URL,
      apiKey: grsaiKey,
      model: DEFAULT_IMAGES_MODEL,
      availableModels: [...GRSAI_IMAGE_MODELS],
      timeout: DEFAULT_API_TIMEOUT,
      apiMode: 'images',
      codexCli: false,
      apiProxy: false,
      responseFormatB64Json: false,
      streamImages: false,
    },
    {
      id: LOCAL_CHANSHUI_PROFILE_ID,
      name: '掺水文本',
      provider: 'openai',
      baseUrl: LOCAL_CHANSHUI_BASE_URL,
      apiKey: chanshuiKey,
      model: 'deepseek-v4.1-flash',
      availableModels: ['deepseek-v4.1-flash', 'gpt-6-astra', 'gpt-6.1-sol', 'deepseek-flash'],
      timeout: DEFAULT_API_TIMEOUT,
      apiMode: 'chat',
      codexCli: false,
      apiProxy: false,
      streamImages: false,
    },
  ]
}

function isUntouchedDefaultOpenAI(profile: ApiProfile | undefined) {
  if (!profile) return false
  const baseUrl = profile.baseUrl.trim().replace(/\/+$/, '').toLowerCase()
  return profile.id === DEFAULT_OPENAI_PROFILE_ID
    && profile.provider === 'openai'
    && !profile.apiKey.trim()
    && (baseUrl === '' || baseUrl === 'https://api.openai.com/v1')
}

export function ensureLocalStudioSettings(settings: AppSettings): AppSettings {
  const seedProviders = [createLocalGrsaiProvider()]
  const seedProfiles = createLocalStudioProfiles()
  const customProviders = [...settings.customProviders]
  const existingProviderIds = new Set(customProviders.map((provider) => provider.id))

  for (const provider of seedProviders) {
    const index = customProviders.findIndex((item) => item.id === provider.id)
    if (index < 0) {
      customProviders.push(provider)
      existingProviderIds.add(provider.id)
      continue
    }
    customProviders[index] = provider
  }

  const profiles = [...settings.profiles]
  const existingProfileIds = new Set(profiles.map((profile) => profile.id))

  for (const seed of seedProfiles) {
    const index = profiles.findIndex((profile) => profile.id === seed.id)
    if (index < 0) {
      profiles.push(seed)
      existingProfileIds.add(seed.id)
      continue
    }

    const current = profiles[index]
    if (!current) continue
    if (seed.id === LOCAL_GRSAI_PROFILE_ID) {
      profiles[index] = {
        ...current,
        provider: seed.provider,
        baseUrl: seed.baseUrl,
        apiKey: current.apiKey.trim() ? current.apiKey : seed.apiKey,
        availableModels: current.availableModels ?? seed.availableModels,
        apiProxy: false,
        responseFormatB64Json: false,
        streamImages: false,
      }
      continue
    }
    if (!current.apiKey.trim() && seed.apiKey.trim()) {
      profiles[index] = {
        ...current,
        apiKey: seed.apiKey,
        availableModels: current.availableModels ?? seed.availableModels,
      }
    }
  }

  const active = profiles.find((profile) => profile.id === settings.activeProfileId)
  const activeProfileId = isUntouchedDefaultOpenAI(active) && existingProfileIds.has(LOCAL_GRSAI_PROFILE_ID)
    ? LOCAL_GRSAI_PROFILE_ID
    : settings.activeProfileId
  // 文本配置存在时顺手把 Agent 切到混合模式，生图仍走 Grsai，对话走文本配置。
  const hasTextProfile = profiles.some((profile) => profile.id === LOCAL_CHANSHUI_PROFILE_ID && profile.apiKey.trim())
  const enablingAgent = settings.agentApiConfigMode === 'off' && hasTextProfile
  const agentApiConfigMode = enablingAgent ? 'hybrid' : settings.agentApiConfigMode
  const agentTextProfileId = enablingAgent
    ? LOCAL_CHANSHUI_PROFILE_ID
    : settings.agentTextProfileId
  // 首次开启时把图像配置指向 Grsai，避免沿用默认的空白 OpenAI 配置。
  const agentImageProfileId = enablingAgent
    ? LOCAL_GRSAI_PROFILE_ID
    : settings.agentImageProfileId

  return normalizeSettings({
    ...settings,
    customProviders,
    profiles,
    activeProfileId,
    agentApiConfigMode,
    agentTextProfileId,
    agentImageProfileId,
  })
}

