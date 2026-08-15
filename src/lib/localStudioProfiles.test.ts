import { describe, expect, it, vi } from 'vitest'
import { createDefaultOpenAIProfile, DEFAULT_OPENAI_PROFILE_ID, DEFAULT_SETTINGS, normalizeSettings } from './apiProfiles'
import {
  LOCAL_CODE2ALITA_HIGH_PROFILE_ID,
  LOCAL_CODE2ALITA_LOW_PROFILE_ID,
  LOCAL_DEEPSEEK_PROFILE_ID,
  LOCAL_GRSAI_PROFILE_ID,
  LOCAL_GRSAI_PROVIDER_ID,
  ensureLocalStudioSettings,
} from './localStudioProfiles'

describe('ensureLocalStudioSettings', () => {
  it('appends the two local providers onto the untouched default OpenAI profile', () => {
    const next = ensureLocalStudioSettings(DEFAULT_SETTINGS)

    expect(next.profiles.map((profile) => profile.id)).toEqual([
      DEFAULT_OPENAI_PROFILE_ID,
      LOCAL_GRSAI_PROFILE_ID,
      LOCAL_CODE2ALITA_HIGH_PROFILE_ID,
      LOCAL_CODE2ALITA_LOW_PROFILE_ID,
      LOCAL_DEEPSEEK_PROFILE_ID,
    ])
    expect(next.customProviders.map((provider) => provider.id)).toContain(LOCAL_GRSAI_PROVIDER_ID)
    expect(next.activeProfileId).toBe(LOCAL_GRSAI_PROFILE_ID)
    expect(next.agentApiConfigMode).toBe('hybrid')
    expect(next.agentTextProfileId).toBe(LOCAL_DEEPSEEK_PROFILE_ID)
    expect(next.agentImageProfileId).toBe(LOCAL_GRSAI_PROFILE_ID)
    expect(next.profiles.find((profile) => profile.id === LOCAL_GRSAI_PROFILE_ID)).toMatchObject({
      name: 'Grsai Dakka',
      provider: LOCAL_GRSAI_PROVIDER_ID,
      model: 'gpt-image-2',
    })
    expect(next.profiles.find((profile) => profile.id === LOCAL_CODE2ALITA_HIGH_PROFILE_ID)?.name).toBe('Code2Alita 高质量')
    expect(next.profiles.find((profile) => profile.id === LOCAL_CODE2ALITA_LOW_PROFILE_ID)?.name).toBe('Code2Alita 低质量')
  })

  it('does not duplicate local studio profiles on a second pass', () => {
    const once = ensureLocalStudioSettings(DEFAULT_SETTINGS)
    const twice = ensureLocalStudioSettings(once)

    expect(twice.profiles.map((profile) => profile.id)).toEqual(once.profiles.map((profile) => profile.id))
    expect(twice.customProviders).toHaveLength(once.customProviders.length)
  })

  it('repairs persisted Grsai settings to use the async task workflow', () => {
    const current = ensureLocalStudioSettings(DEFAULT_SETTINGS)
    const next = ensureLocalStudioSettings(normalizeSettings({
      ...current,
      customProviders: current.customProviders.map((provider) => provider.id === LOCAL_GRSAI_PROVIDER_ID ? {
        ...provider,
        submit: { ...provider.submit, body: { ...provider.submit.body, replyType: undefined }, taskIdPath: undefined },
        poll: undefined,
      } : provider),
      profiles: current.profiles.map((profile) => profile.id === LOCAL_GRSAI_PROFILE_ID ? {
        ...profile,
        responseFormatB64Json: true,
        apiProxy: true,
      } : profile),
    }))

    expect(next.customProviders.find((provider) => provider.id === LOCAL_GRSAI_PROVIDER_ID)).toMatchObject({
      submit: { taskIdPath: 'id', body: expect.objectContaining({ replyType: 'async' }) },
      poll: { path: 'api/result?id={task_id}' },
    })
    const repairedProfile = next.profiles.find((profile) => profile.id === LOCAL_GRSAI_PROFILE_ID)
    expect(repairedProfile).toMatchObject({ apiProxy: false })
    expect(repairedProfile?.responseFormatB64Json).not.toBe(true)
  })

  it('keeps a customized active profile and still fills the missing local ones', () => {
    const current = normalizeSettings({
      profiles: [createDefaultOpenAIProfile({ apiKey: 'user-key', baseUrl: 'https://example.com/v1' })],
      activeProfileId: DEFAULT_OPENAI_PROFILE_ID,
    })
    const next = ensureLocalStudioSettings(current)

    expect(next.activeProfileId).toBe(DEFAULT_OPENAI_PROFILE_ID)
    expect(next.profiles.map((profile) => profile.id)).toEqual([
      DEFAULT_OPENAI_PROFILE_ID,
      LOCAL_GRSAI_PROFILE_ID,
      LOCAL_CODE2ALITA_HIGH_PROFILE_ID,
      LOCAL_CODE2ALITA_LOW_PROFILE_ID,
      LOCAL_DEEPSEEK_PROFILE_ID,
    ])
    expect(next.agentApiConfigMode).toBe('hybrid')
    expect(next.agentTextProfileId).toBe(LOCAL_DEEPSEEK_PROFILE_ID)
    expect(next.agentImageProfileId).toBe(DEFAULT_OPENAI_PROFILE_ID)
  })

  it('does not override an existing custom Agent text setup', () => {
    const current = normalizeSettings({
      profiles: [
        createDefaultOpenAIProfile({ apiKey: 'user-key', apiMode: 'responses', model: 'gpt-5.6-sol' }),
      ],
      activeProfileId: DEFAULT_OPENAI_PROFILE_ID,
      agentApiConfigMode: 'native',
      agentTextProfileId: DEFAULT_OPENAI_PROFILE_ID,
    })
    const next = ensureLocalStudioSettings(current)
    expect(next.agentApiConfigMode).toBe('native')
    expect(next.agentTextProfileId).toBe(DEFAULT_OPENAI_PROFILE_ID)
  })

  it('seeds DeepSeek as the default hybrid text profile on an untouched studio', () => {
    const next = ensureLocalStudioSettings(DEFAULT_SETTINGS)
    expect(next.profiles.find((profile) => profile.id === LOCAL_DEEPSEEK_PROFILE_ID)).toMatchObject({
      name: 'DeepSeek 官网',
      provider: 'openai',
      baseUrl: 'https://api.deepseek.com',
      apiKey: '',
      model: 'deepseek-chat',
      apiMode: 'chat',
    })
    expect(next.agentApiConfigMode).toBe('hybrid')
    expect(next.agentTextProfileId).toBe(LOCAL_DEEPSEEK_PROFILE_ID)
    expect(next.agentImageProfileId).toBe(LOCAL_GRSAI_PROFILE_ID)
  })

  it('fills an empty local key from env without replacing an existing key', () => {
    vi.stubEnv('VITE_GRSAI_DAKKA_API_KEY', 'seed-grsai-key')
    const current = ensureLocalStudioSettings(DEFAULT_SETTINGS)
    const existing = current.profiles.find((profile) => profile.id === LOCAL_GRSAI_PROFILE_ID)
    expect(existing?.apiKey).toBe('seed-grsai-key')

    const locked = ensureLocalStudioSettings(normalizeSettings({
      ...current,
      profiles: current.profiles.map((profile) => (
        profile.id === LOCAL_GRSAI_PROFILE_ID ? { ...profile, apiKey: 'already-set' } : profile
      )),
    }))
    expect(locked.profiles.find((profile) => profile.id === LOCAL_GRSAI_PROFILE_ID)?.apiKey).toBe('already-set')
    vi.unstubAllEnvs()
  })
})
