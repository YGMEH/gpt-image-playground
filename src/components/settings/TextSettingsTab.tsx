import { useEffect, useRef, useState } from 'react'
import type { ApiMode, ApiProfile, AppSettings } from '../../types'
import {
  DEFAULT_CHAT_MODEL,
  DEFAULT_RESPONSES_MODEL,
  DEFAULT_SETTINGS,
  createDefaultOpenAIProfile,
  isAgentTextApiProfile,
  normalizeSettings,
} from '../../lib/apiProfiles'
import { allowsEmptyDeepSeekApiKey } from '../../lib/deepseekModelCatalog'
import { canRefreshProviderModels, fetchProviderModels } from '../../lib/fetchProviderModels'
import Select from '../Select'
import { PlusIcon, RefreshIcon, TrashIcon } from '../icons'

interface SelectOption {
  label: string
  value: string
}

interface TextSettingsTabProps {
  draft: AppSettings
  selectedTextProfile: ApiProfile | null
  textProfiles: ApiProfile[]
  textProfileOptions: SelectOption[]
  defaultConfigOnly: boolean
  commitSettings: (nextDraft: AppSettings) => void
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void
}

function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function getDefaultModelForMode(apiMode: ApiMode) {
  if (apiMode === 'responses') return DEFAULT_RESPONSES_MODEL
  if (apiMode === 'chat') return DEFAULT_CHAT_MODEL
  return DEFAULT_SETTINGS.model
}

export default function TextSettingsTab({
  draft,
  selectedTextProfile,
  textProfiles,
  textProfileOptions,
  defaultConfigOnly,
  commitSettings,
  showToast,
}: TextSettingsTabProps) {
  const [showApiKey, setShowApiKey] = useState(false)
  const [timeoutInput, setTimeoutInput] = useState(String(selectedTextProfile?.timeout ?? DEFAULT_SETTINGS.timeout))
  const [modelRefreshStatus, setModelRefreshStatus] = useState('尚未刷新')
  const [isRefreshingModels, setIsRefreshingModels] = useState(false)
  const modelRefreshRequestIdRef = useRef(0)

  const textProfile = selectedTextProfile
  const availableModels = textProfile?.availableModels ?? []
  const modelSelectOptions = textProfile
    ? [
        ...availableModels.map((model) => ({ label: model, value: model })),
        ...(textProfile.model.trim() && !availableModels.includes(textProfile.model.trim())
          ? [{ label: `${textProfile.model.trim()}（当前）`, value: textProfile.model.trim() }]
          : []),
      ]
    : []
  const canRefreshModels = textProfile ? canRefreshProviderModels(draft, textProfile) : false

  useEffect(() => {
    setTimeoutInput(String(textProfile?.timeout ?? DEFAULT_SETTINGS.timeout))
    setShowApiKey(false)
  }, [textProfile?.id, textProfile?.timeout])

  useEffect(() => {
    modelRefreshRequestIdRef.current += 1
    setIsRefreshingModels(false)
    if (!textProfile) {
      setModelRefreshStatus('尚未选择文本配置')
      return
    }
    if (availableModels.length) {
      setModelRefreshStatus(`已缓存 ${availableModels.length} 个模型`)
      return
    }
    if (!canRefreshModels) {
      setModelRefreshStatus('当前服务商不支持自动刷新模型')
      return
    }
    setModelRefreshStatus('尚未刷新')
  }, [textProfile?.id, textProfile?.provider, availableModels.length, canRefreshModels])

  const updateTextProfile = (patch: Partial<ApiProfile>, commit = false) => {
    if (!textProfile) return
    const nextDraft = {
      ...draft,
      agentTextProfileId: textProfile.id,
      profiles: draft.profiles.map((profile) => profile.id === textProfile.id ? { ...profile, ...patch } : profile),
    }
    if (commit) commitSettings(nextDraft)
    else commitSettings(nextDraft)
  }

  const switchTextProfile = (id: string) => {
    if (!id || id === textProfile?.id) return
    commitSettings({
      ...draft,
      agentTextProfileId: id,
      agentApiConfigMode: draft.agentApiConfigMode === 'off' ? 'hybrid' : draft.agentApiConfigMode,
    })
  }

  const createNewTextProfile = () => {
    if (defaultConfigOnly) return
    const profile = createDefaultOpenAIProfile({
      id: newId('openai'),
      name: '新文本配置',
      apiMode: 'chat',
      model: DEFAULT_CHAT_MODEL,
      streamImages: false,
    })
    commitSettings(normalizeSettings({
      ...draft,
      profiles: [...draft.profiles, profile],
      agentTextProfileId: profile.id,
      agentApiConfigMode: draft.agentApiConfigMode === 'off' ? 'hybrid' : draft.agentApiConfigMode,
    }))
  }

  const deleteTextProfile = () => {
    if (!textProfile || defaultConfigOnly) return
    if (draft.profiles.length <= 1) {
      showToast('至少需要保留一份配置', 'info')
      return
    }
    const remaining = draft.profiles.filter((profile) => profile.id !== textProfile.id)
    const nextText = remaining.find(isAgentTextApiProfile)
    commitSettings(normalizeSettings({
      ...draft,
      profiles: remaining,
      agentTextProfileId: nextText?.id ?? null,
      activeProfileId: draft.activeProfileId === textProfile.id ? remaining[0].id : draft.activeProfileId,
    }))
  }

  const commitTimeout = () => {
    if (!textProfile) return
    const nextTimeout = Number(timeoutInput)
    const normalizedTimeout = timeoutInput.trim() === '' || Number.isNaN(nextTimeout)
      ? DEFAULT_SETTINGS.timeout
      : nextTimeout
    setTimeoutInput(String(normalizedTimeout))
    updateTextProfile({ timeout: normalizedTimeout }, true)
  }

  const refreshModels = async () => {
    if (!textProfile) return
    if (!canRefreshModels) {
      const message = '当前服务商不支持自动刷新模型'
      setModelRefreshStatus(message)
      showToast(message, 'info')
      return
    }
    if (isRefreshingModels) return
    const requestId = modelRefreshRequestIdRef.current + 1
    modelRefreshRequestIdRef.current = requestId
    setIsRefreshingModels(true)
    setModelRefreshStatus('正在刷新模型…')
    try {
      const models = await fetchProviderModels(draft, textProfile)
      if (modelRefreshRequestIdRef.current !== requestId) return
      const nextModel = textProfile.model.trim() && models.includes(textProfile.model.trim())
        ? textProfile.model.trim()
        : models[0]
      updateTextProfile({ availableModels: models, model: nextModel }, true)
      setModelRefreshStatus(`连接成功，获取 ${models.length} 个模型`)
      showToast(`已获取 ${models.length} 个模型`, 'success')
    } catch (error) {
      if (modelRefreshRequestIdRef.current !== requestId) return
      const message = error instanceof Error ? error.message : String(error)
      setModelRefreshStatus(`连接失败：${message}`)
      showToast(`刷新模型失败：${message}`, 'error')
    } finally {
      if (modelRefreshRequestIdRef.current === requestId) setIsRefreshingModels(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-gray-50/80 p-4 border border-gray-200/60 dark:bg-white/[0.02] dark:border-white/[0.05]">
        <div data-selectable-text className="text-[13px] leading-relaxed text-gray-500 dark:text-gray-400">
          这里只改文本模型，不会影响图库当前选中的图像配置。Agent 混合模式会用这里的配置对话和调用工具，默认使用 DeepSeek 官网的 <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[10px] dark:bg-white/[0.06]">deepseek-chat</code>。
        </div>
      </div>

      <div className="block">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="block text-sm text-gray-600 dark:text-gray-300">当前文本配置</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={createNewTextProfile}
              disabled={defaultConfigOnly}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-blue-600 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-blue-400 dark:hover:bg-blue-500/10"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              新建
            </button>
            {textProfile && (
              <button
                type="button"
                onClick={deleteTextProfile}
                disabled={defaultConfigOnly || draft.profiles.length <= 1}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-red-500 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-red-500/10"
              >
                <TrashIcon className="h-3.5 w-3.5" />
                删除
              </button>
            )}
          </div>
        </div>
        {textProfileOptions.length > 0 ? (
          <Select
            value={textProfile?.id ?? ''}
            onChange={(value) => switchTextProfile(String(value))}
            options={textProfileOptions}
            showValueTooltips
            className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2.5 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
          />
        ) : (
          <div className="w-full rounded-xl border border-gray-200/60 bg-white/50 px-3 py-2.5 text-center text-sm text-gray-500 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-400">
            还没有文本模型配置
          </div>
        )}
      </div>

      {textProfile && (
        <>
          <label className="block">
            <span className="mb-1.5 block text-sm text-gray-600 dark:text-gray-300">配置名称</span>
            <input
              value={textProfile.name}
              onChange={(e) => updateTextProfile({ name: e.target.value })}
              onBlur={(e) => updateTextProfile({ name: e.target.value }, true)}
              type="text"
              className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2.5 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm text-gray-600 dark:text-gray-300">API URL</span>
            <input
              value={textProfile.baseUrl}
              onChange={(e) => updateTextProfile({ baseUrl: e.target.value })}
              onBlur={(e) => updateTextProfile({ baseUrl: e.target.value }, true)}
              type="text"
              placeholder="https://api.deepseek.com"
              className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2.5 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
            />
            <div data-selectable-text className="mt-1.5 text-xs text-gray-500 dark:text-gray-500">
              DeepSeek 官网默认 <code className="rounded bg-gray-100 px-1 py-0.5 dark:bg-white/[0.06]">https://api.deepseek.com</code>，请求会走本地反代。
            </div>
          </label>

          <div className="block">
            <span className="mb-1.5 block text-sm text-gray-600 dark:text-gray-300">API Key</span>
            <div className="relative">
              <input
                value={textProfile.apiKey}
                onChange={(e) => updateTextProfile({ apiKey: e.target.value })}
                onBlur={(e) => updateTextProfile({ apiKey: e.target.value }, true)}
                type={showApiKey ? 'text' : 'password'}
                placeholder={allowsEmptyDeepSeekApiKey(textProfile) ? '本地反代已注入，可留空' : 'sk-...'}
                className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2.5 pr-10 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
              />
              <button
                type="button"
                onClick={() => setShowApiKey((value) => !value)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                tabIndex={-1}
              >
                {showApiKey ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="block">
            <span className="mb-1.5 block text-sm text-gray-600 dark:text-gray-300">API 接口</span>
            <Select
              value={textProfile.apiMode === 'responses' ? 'responses' : 'chat'}
              onChange={(value) => {
                const apiMode = value as ApiMode
                const nextModel =
                  textProfile.model === DEFAULT_CHAT_MODEL || textProfile.model === DEFAULT_RESPONSES_MODEL
                    ? getDefaultModelForMode(apiMode)
                    : textProfile.model
                updateTextProfile({ apiMode, model: nextModel }, true)
              }}
              options={[
                { label: 'Chat Completions (/v1/chat/completions)', value: 'chat' },
                { label: 'Responses API (/v1/responses)', value: 'responses' },
              ]}
              className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2.5 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
            />
            <div data-selectable-text className="mt-1.5 text-xs text-gray-500 dark:text-gray-500">
              DeepSeek 官网使用 Chat Completions；OpenAI 原生 Agent 使用 Responses API。
            </div>
          </div>

          <div className="block">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="block text-sm text-gray-600 dark:text-gray-300">模型 ID</span>
              <button
                type="button"
                onClick={() => { void refreshModels() }}
                disabled={isRefreshingModels}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-blue-600 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-blue-400 dark:hover:bg-blue-500/10"
                aria-label="刷新模型"
              >
                <RefreshIcon className={`h-3.5 w-3.5 ${isRefreshingModels ? 'animate-spin' : ''}`} />
                {isRefreshingModels ? '刷新中' : '刷新模型'}
              </button>
            </div>
            <div className="space-y-2">
              {modelSelectOptions.length > 0 && (
                <Select
                  value={textProfile.model}
                  onChange={(value) => updateTextProfile({ model: String(value) }, true)}
                  options={modelSelectOptions}
                  showValueTooltips
                  className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2.5 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
                />
              )}
              <input
                value={textProfile.model}
                onChange={(e) => updateTextProfile({ model: e.target.value })}
                onBlur={(e) => updateTextProfile({ model: e.target.value }, true)}
                type="text"
                placeholder={getDefaultModelForMode(textProfile.apiMode)}
                className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2.5 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
              />
            </div>
            <div data-selectable-text className="mt-1.5 text-xs text-gray-500 dark:text-gray-500">
              {textProfile.apiMode === 'responses'
                ? <>Responses API 需要支持工具调用的文本模型，例如 <code className="rounded bg-gray-100 px-1 py-0.5 dark:bg-white/[0.06]">{DEFAULT_RESPONSES_MODEL}</code>。</>
                : <>Chat Completions 默认使用 DeepSeek 的 <code className="rounded bg-gray-100 px-1 py-0.5 dark:bg-white/[0.06]">{DEFAULT_CHAT_MODEL}</code>，也可选 <code className="rounded bg-gray-100 px-1 py-0.5 dark:bg-white/[0.06]">deepseek-reasoner</code>。刷新模型只会读取本地清单，不会请求外网。</>}
              <div className="mt-1">{modelRefreshStatus}</div>
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm text-gray-600 dark:text-gray-300">请求超时 (秒)</span>
            <input
              value={timeoutInput}
              onChange={(e) => setTimeoutInput(e.target.value)}
              onBlur={commitTimeout}
              type="number"
              min={10}
              max={600}
              className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2.5 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
            />
          </label>
        </>
      )}
    </div>
  )
}
