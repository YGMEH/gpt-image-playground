import type { ApiProfile, AppSettings, CustomProviderDefinition } from '../types'
import {
  DEFAULT_API_TIMEOUT,
  DEFAULT_IMAGES_MODEL,
  DEFAULT_OPENAI_PROFILE_ID,
  normalizeSettings,
} from './apiProfiles'
import { getGrsaiCatalogModels } from './grsaiModelCatalog'
import { readRuntimeEnv } from './runtimeEnv'
export const LOCAL_GRSAI_PROVIDER_ID = 'custom-grsai-dakka'
export const LOCAL_GRSAI_PROFILE_ID = 'grsai-dakka-default'
export const LOCAL_CODE2ALITA_HIGH_PROFILE_ID = 'code2alita-high'
export const LOCAL_CODE2ALITA_LOW_PROFILE_ID = 'code2alita-low'
export const LOCAL_GRSAI_BASE_URL = 'https://grsai.dakka.com.cn/v1'
export const LOCAL_CODE2ALITA_BASE_URL = 'https://code2alita.com/v1'

function readLocalKey(value: string | undefined) {
  return readRuntimeEnv(value)
}

export function createLocalGrsaiProvider(): CustomProviderDefinition {
  return {
    id: LOCAL_GRSAI_PROVIDER_ID,
    name: 'Grsai Dakka',
    template: 'http-image',
    submit: {
      path: 'draw/completions',
      method: 'POST',
      contentType: 'json',
      body: {
        model: '$profile.model',
        prompt: '$prompt',
        size: '$params.size',
        quality: '$params.quality',
        n: '$params.n',
        urls: '$inputImages.dataUrls',
        replyType: 'async',
      },
      taskIdPath: 'id',
      result: {
        imageUrlPaths: ['data.*.url'],
        b64JsonPaths: ['data.*.b64_json'],
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
  const highKey = readLocalKey(import.meta.env.VITE_CODE2ALITA_HIGH_API_KEY)
  const lowKey = readLocalKey(import.meta.env.VITE_CODE2ALITA_LOW_API_KEY)

  return [
    {
      id: LOCAL_GRSAI_PROFILE_ID,
      name: 'Grsai Dakka',
      provider: LOCAL_GRSAI_PROVIDER_ID,
      baseUrl: LOCAL_GRSAI_BASE_URL,
      apiKey: grsaiKey,
      model: DEFAULT_IMAGES_MODEL,
      availableModels: getGrsaiCatalogModels(),
      timeout: DEFAULT_API_TIMEOUT,
      apiMode: 'images',
      codexCli: false,
      apiProxy: false,
      responseFormatB64Json: false,
      streamImages: false,
    },
    {
      id: LOCAL_CODE2ALITA_HIGH_PROFILE_ID,
      name: 'Code2Alita 高质量',
      provider: 'openai',
      baseUrl: LOCAL_CODE2ALITA_BASE_URL,
      apiKey: highKey,
      model: DEFAULT_IMAGES_MODEL,
      timeout: DEFAULT_API_TIMEOUT,
      apiMode: 'images',
      codexCli: false,
      apiProxy: false,
      streamImages: false,
    },
    {
      id: LOCAL_CODE2ALITA_LOW_PROFILE_ID,
      name: 'Code2Alita 低质量',
      provider: 'openai',
      baseUrl: LOCAL_CODE2ALITA_BASE_URL,
      apiKey: lowKey,
      model: DEFAULT_IMAGES_MODEL,
      timeout: DEFAULT_API_TIMEOUT,
      apiMode: 'images',
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

  return normalizeSettings({
    ...settings,
    customProviders,
    profiles,
    activeProfileId,
  })
}
