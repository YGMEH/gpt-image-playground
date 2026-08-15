import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore, type PromptLibraryTab } from '../../store'
import { usePreventBackgroundScroll } from '../../hooks/usePreventBackgroundScroll'
import { useCloseOnEscape } from '../../hooks/useCloseOnEscape'
import {
  QUICK_PHRASE_LABEL_MAX_LENGTH,
  QUICK_PHRASE_TEXT_MAX_LENGTH,
  SAVED_PROMPT_CONTENT_MAX_LENGTH,
  SAVED_PROMPT_TITLE_MAX_LENGTH,
  collectSavedPromptTags,
  filterSavedPrompts,
  type SavedPromptSort,
} from '../../lib/promptLibraryState'
import {
  INSPIRATION_PROMPT_COUNT,
  INSPIRATION_SOURCE,
  INSPIRATION_TAGS,
  getLoadedInspirationPrompts,
  loadInspirationPrompts,
  type InspirationPrompt,
} from '../../data/inspirationSource'
import type { QuickPhrase, SavedPrompt } from '../../types'
import { CloseIcon, EditIcon, PlusIcon, TrashIcon } from '../icons'

const TABS: Array<{ key: PromptLibraryTab; label: string }> = [
  { key: 'saved', label: '我的提示词' },
  { key: 'quick', label: '快捷短语' },
  { key: 'inspiration', label: '灵感画廊' },
]

const SORTS: Array<{ key: SavedPromptSort; label: string }> = [
  { key: 'recent', label: '最近更新' },
  { key: 'used', label: '最常使用' },
  { key: 'title', label: '按名称' },
]

/** 灵感画廊每次渲染的条目数，避免一次性挂载上百张远程图片 */
const INSPIRATION_PAGE_SIZE = 24

const chipClass = (active: boolean) => `rounded-full border px-2.5 py-1 text-xs transition-colors ${active
  ? 'border-blue-400 bg-blue-50 text-blue-600 dark:border-blue-500/50 dark:bg-blue-500/10 dark:text-blue-300'
  : 'border-gray-200/70 bg-white/60 text-gray-600 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-300 dark:hover:bg-white/[0.06]'
}`

const inputClass = 'w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2 text-sm text-gray-700 outline-none transition-colors focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50'

const smallButtonClass = 'rounded-lg px-2 py-1 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-200'

const primaryButtonClass = 'rounded-xl bg-blue-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50'

function InspirationThumb({ item }: { item: InspirationPrompt }) {
  // 主源用 jsDelivr（部分网络无法直连 raw.githubusercontent），失败再回退 GitHub raw
  const sources = useMemo(() => {
    if (!item.imageUrl) return []
    const list = [item.imageUrl]
    const rawFallback = item.imageUrl.replace(
      'https://cdn.jsdelivr.net/gh/jamez-bondos/awesome-gpt4o-images@main/',
      'https://raw.githubusercontent.com/jamez-bondos/awesome-gpt4o-images/main/',
    )
    if (rawFallback !== item.imageUrl) list.push(rawFallback)
    return list
  }, [item.imageUrl])
  const [sourceIndex, setSourceIndex] = useState(0)

  if (sources.length === 0 || sourceIndex >= sources.length) {
    return (
      <div className="flex h-32 w-full items-center justify-center rounded-xl bg-gray-100 text-[11px] text-gray-400 dark:bg-white/[0.04] dark:text-gray-500">
        示例图加载失败
      </div>
    )
  }

  return (
    <img
      key={sources[sourceIndex]}
      src={sources[sourceIndex]}
      alt={item.title}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setSourceIndex((index) => index + 1)}
      className="h-32 w-full rounded-xl bg-gray-100 object-cover dark:bg-white/[0.04]"
    />
  )
}

function SavedPromptCard({
  prompt,
  onApply,
  onEdit,
  onDelete,
}: {
  prompt: SavedPrompt
  onApply: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="rounded-2xl border border-gray-200/70 bg-white/60 p-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{prompt.title}</div>
          <div className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            {prompt.content}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={onEdit} className={smallButtonClass} aria-label="编辑提示词">
            <EditIcon className="h-4 w-4" />
          </button>
          <button type="button" onClick={onDelete} className={`${smallButtonClass} hover:text-red-500`} aria-label="删除提示词">
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {prompt.tags.map((tag) => (
          <span key={tag} className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
            {tag}
          </span>
        ))}
        {prompt.useCount > 0 && (
          <span className="text-[11px] text-gray-400 dark:text-gray-500">已用 {prompt.useCount} 次</span>
        )}
        {prompt.sourceAuthor && (
          <span className="text-[11px] text-gray-400 dark:text-gray-500">来源 {prompt.sourceAuthor}</span>
        )}
        <button type="button" onClick={onApply} className={`${primaryButtonClass} ml-auto`}>
          填入
        </button>
      </div>
    </div>
  )
}

export default function PromptLibraryModal() {
  const activeTab = useStore((s) => s.promptLibraryTab)
  const closePromptLibrary = useStore((s) => s.closePromptLibrary)
  const openPromptLibrary = useStore((s) => s.openPromptLibrary)
  const prompt = useStore((s) => s.prompt)
  const savedPrompts = useStore((s) => s.savedPrompts)
  const quickPhrases = useStore((s) => s.quickPhrases)
  const addSavedPrompt = useStore((s) => s.addSavedPrompt)
  const editSavedPrompt = useStore((s) => s.editSavedPrompt)
  const removeSavedPrompt = useStore((s) => s.removeSavedPrompt)
  const applySavedPrompt = useStore((s) => s.applySavedPrompt)
  const addQuickPhrase = useStore((s) => s.addQuickPhrase)
  const editQuickPhrase = useStore((s) => s.editQuickPhrase)
  const removeQuickPhrase = useStore((s) => s.removeQuickPhrase)
  const restoreDefaultQuickPhrases = useStore((s) => s.restoreDefaultQuickPhrases)
  const appendQuickPhraseToPrompt = useStore((s) => s.appendQuickPhraseToPrompt)
  const setPrompt = useStore((s) => s.setPrompt)
  const showToast = useStore((s) => s.showToast)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)

  const modalRef = useRef<HTMLDivElement>(null)
  const mouseDownTargetRef = useRef<EventTarget | null>(null)

  const open = activeTab != null
  usePreventBackgroundScroll(open, modalRef)
  useCloseOnEscape(open, closePromptLibrary)

  const [savedQuery, setSavedQuery] = useState('')
  const [savedTag, setSavedTag] = useState<string | null>(null)
  const [savedSort, setSavedSort] = useState<SavedPromptSort>('recent')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftContent, setDraftContent] = useState('')
  const [draftTags, setDraftTags] = useState('')

  const [phraseEditingId, setPhraseEditingId] = useState<string | null>(null)
  const [phraseLabel, setPhraseLabel] = useState('')
  const [phraseText, setPhraseText] = useState('')

  const [inspirationQuery, setInspirationQuery] = useState('')
  const [inspirationTag, setInspirationTag] = useState<string | null>(null)
  const [inspirationLimit, setInspirationLimit] = useState(INSPIRATION_PAGE_SIZE)
  const [expandedInspirationId, setExpandedInspirationId] = useState<string | null>(null)
  const [inspirationData, setInspirationData] = useState<InspirationPrompt[] | null>(() => getLoadedInspirationPrompts())
  const [inspirationLoadFailed, setInspirationLoadFailed] = useState(false)

  // 灵感画廊数据约 180KB，只在切到该 Tab 时动态加载，避免拖慢首屏
  useEffect(() => {
    if (activeTab !== 'inspiration' || inspirationData) return
    let cancelled = false
    setInspirationLoadFailed(false)
    loadInspirationPrompts()
      .then((prompts) => {
        if (!cancelled) setInspirationData(prompts)
      })
      .catch(() => {
        if (!cancelled) setInspirationLoadFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [activeTab, inspirationData])

  // 关闭后重置编辑态，避免下次打开残留半截表单
  useEffect(() => {
    if (open) return
    setEditingId(null)
    setPhraseEditingId(null)
    setExpandedInspirationId(null)
  }, [open])

  useEffect(() => {
    setInspirationLimit(INSPIRATION_PAGE_SIZE)
  }, [inspirationQuery, inspirationTag])

  const savedTags = useMemo(() => collectSavedPromptTags(savedPrompts), [savedPrompts])
  const visibleSavedPrompts = useMemo(
    () => filterSavedPrompts(savedPrompts, { query: savedQuery, tag: savedTag, sort: savedSort }),
    [savedPrompts, savedQuery, savedTag, savedSort],
  )

  const filteredInspiration = useMemo(() => {
    if (!inspirationData) return []
    const query = inspirationQuery.trim().toLowerCase()
    return inspirationData.filter((item) => {
      if (inspirationTag && !item.tags.includes(inspirationTag)) return false
      if (!query) return true
      return item.title.toLowerCase().includes(query)
        || (item.titleEn ?? '').toLowerCase().includes(query)
        || item.prompt.toLowerCase().includes(query)
        || (item.promptEn ?? '').toLowerCase().includes(query)
    })
  }, [inspirationData, inspirationQuery, inspirationTag])

  const visibleInspiration = useMemo(
    () => filteredInspiration.slice(0, inspirationLimit),
    [filteredInspiration, inspirationLimit],
  )

  if (!open) return null

  const handleMouseDown = (e: React.MouseEvent) => {
    mouseDownTargetRef.current = e.target
  }

  const handleMouseUp = (e: React.MouseEvent) => {
    const downTarget = mouseDownTargetRef.current
    mouseDownTargetRef.current = null
    if (!modalRef.current || !downTarget) return
    if (modalRef.current.contains(downTarget as Node)) return
    if (modalRef.current.contains(e.target as Node)) return
    closePromptLibrary()
  }

  const startEditPrompt = (item: SavedPrompt) => {
    setEditingId(item.id)
    setDraftTitle(item.title)
    setDraftContent(item.content)
    setDraftTags(item.tags.join(' '))
  }

  const startCreatePrompt = () => {
    setEditingId('new')
    setDraftTitle('')
    setDraftContent(prompt)
    setDraftTags('')
  }

  const parseTags = (value: string) => value.split(/[\s,，、]+/).filter(Boolean)

  const submitPromptDraft = () => {
    if (!draftContent.trim()) {
      showToast('提示词内容不能为空', 'error')
      return
    }
    if (editingId === 'new') {
      const created = addSavedPrompt({ title: draftTitle, content: draftContent, tags: parseTags(draftTags) })
      showToast(created ? '已保存到提示词库' : '保存失败', created ? 'success' : 'error')
    } else if (editingId) {
      editSavedPrompt(editingId, { title: draftTitle, content: draftContent, tags: parseTags(draftTags) })
      showToast('已更新提示词', 'success')
    }
    setEditingId(null)
  }

  const confirmDeletePrompt = (item: SavedPrompt) => {
    setConfirmDialog({
      title: '删除提示词',
      message: `确定要删除「${item.title}」吗？`,
      tone: 'danger',
      action: () => removeSavedPrompt(item.id),
    })
  }

  const startEditPhrase = (phrase: QuickPhrase) => {
    setPhraseEditingId(phrase.id)
    setPhraseLabel(phrase.label)
    setPhraseText(phrase.text)
  }

  const startCreatePhrase = () => {
    setPhraseEditingId('new')
    setPhraseLabel('')
    setPhraseText('')
  }

  const submitPhraseDraft = () => {
    if (!phraseText.trim()) {
      showToast('短语内容不能为空', 'error')
      return
    }
    if (phraseEditingId === 'new') {
      const created = addQuickPhrase(phraseLabel, phraseText)
      showToast(created ? '已添加快捷短语' : '添加失败', created ? 'success' : 'error')
    } else if (phraseEditingId) {
      editQuickPhrase(phraseEditingId, { label: phraseLabel, text: phraseText })
      showToast('已更新快捷短语', 'success')
    }
    setPhraseEditingId(null)
  }

  const useInspiration = (item: InspirationPrompt, promptText: string) => {
    setPrompt(promptText)
    closePromptLibrary()
    showToast(`已填入「${item.title}」`, 'success')
  }

  const saveInspiration = (item: InspirationPrompt, promptText: string) => {
    const created = addSavedPrompt({
      title: item.title,
      content: promptText,
      tags: item.tags,
      sourceId: item.id,
      sourceUrl: item.caseUrl,
      sourceAuthor: item.author,
    })
    showToast(created ? '已收藏到我的提示词' : '收藏失败', created ? 'success' : 'error')
  }

  return (
    <div
      data-no-drag-select
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4"
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-overlay-in" />
      <div
        ref={modalRef}
        className="relative z-10 flex h-[86vh] w-full max-w-3xl flex-col rounded-3xl border border-white/50 bg-white/95 p-4 shadow-2xl ring-1 ring-black/5 animate-modal-in dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10 sm:p-5"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">提示词库</h3>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">管理常用提示词、快捷短语，或从灵感画廊挑一个直接用</p>
          </div>
          <button
            onClick={closePromptLibrary}
            className="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
            aria-label="关闭"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 flex rounded-xl bg-gray-100/80 p-1 dark:bg-white/[0.04]">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => openPromptLibrary(tab.key)}
              className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors ${activeTab === tab.key
                ? 'bg-white text-gray-800 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
              aria-pressed={activeTab === tab.key}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'saved' && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input
                value={savedQuery}
                onChange={(e) => setSavedQuery(e.target.value)}
                placeholder="搜索名称、正文或标签"
                className={`${inputClass} flex-1 min-w-[160px]`}
              />
              <div className="flex items-center gap-1">
                {SORTS.map((item) => (
                  <button key={item.key} type="button" onClick={() => setSavedSort(item.key)} className={chipClass(savedSort === item.key)}>
                    {item.label}
                  </button>
                ))}
              </div>
              <button type="button" onClick={startCreatePrompt} className="flex items-center gap-1 rounded-xl bg-blue-500 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-600">
                <PlusIcon className="h-3.5 w-3.5" />
                保存当前
              </button>
            </div>

            {savedTags.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                <button type="button" onClick={() => setSavedTag(null)} className={chipClass(savedTag === null)}>全部</button>
                {savedTags.map((tag) => (
                  <button key={tag} type="button" onClick={() => setSavedTag(tag === savedTag ? null : tag)} className={chipClass(savedTag === tag)}>
                    {tag}
                  </button>
                ))}
              </div>
            )}

            {editingId && (
              <div className="mb-3 space-y-2 rounded-2xl border border-blue-200/70 bg-blue-50/40 p-3 dark:border-blue-500/30 dark:bg-blue-500/[0.06]">
                <input
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  maxLength={SAVED_PROMPT_TITLE_MAX_LENGTH}
                  placeholder="名称（留空则自动取首行）"
                  className={inputClass}
                />
                <textarea
                  value={draftContent}
                  onChange={(e) => setDraftContent(e.target.value)}
                  maxLength={SAVED_PROMPT_CONTENT_MAX_LENGTH}
                  rows={5}
                  placeholder="提示词正文"
                  className={`${inputClass} resize-y font-normal leading-relaxed`}
                />
                <input
                  value={draftTags}
                  onChange={(e) => setDraftTags(e.target.value)}
                  placeholder="标签，用空格或逗号分隔（最多 5 个）"
                  className={inputClass}
                />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setEditingId(null)} className="rounded-xl bg-gray-100 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1]">
                    取消
                  </button>
                  <button type="button" onClick={submitPromptDraft} className={primaryButtonClass}>
                    {editingId === 'new' ? '保存' : '更新'}
                  </button>
                </div>
              </div>
            )}

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto custom-scrollbar pr-1 -mr-1">
              {visibleSavedPrompts.length === 0 ? (
                <div className="flex h-full min-h-[160px] items-center justify-center text-center text-xs leading-relaxed text-gray-400 dark:text-gray-500">
                  {savedPrompts.length === 0
                    ? <>还没有保存的提示词。<br />在输入框写好后点「保存当前」，或去灵感画廊收藏几个。</>
                    : '没有匹配的提示词'}
                </div>
              ) : (
                visibleSavedPrompts.map((item) => (
                  <SavedPromptCard
                    key={item.id}
                    prompt={item}
                    onApply={() => {
                      applySavedPrompt(item.id)
                      closePromptLibrary()
                      showToast(`已填入「${item.title}」`, 'success')
                    }}
                    onEdit={() => startEditPrompt(item)}
                    onDelete={() => confirmDeletePrompt(item)}
                  />
                ))
              )}
            </div>
          </>
        )}

        {activeTab === 'quick' && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <p className="flex-1 text-xs text-gray-400 dark:text-gray-500">点短语会追加到当前提示词末尾，不会覆盖已写的内容。</p>
              <button type="button" onClick={restoreDefaultQuickPhrases} className={smallButtonClass}>恢复内置短语</button>
              <button type="button" onClick={startCreatePhrase} className="flex items-center gap-1 rounded-xl bg-blue-500 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-600">
                <PlusIcon className="h-3.5 w-3.5" />
                新增
              </button>
            </div>

            {phraseEditingId && (
              <div className="mb-3 space-y-2 rounded-2xl border border-blue-200/70 bg-blue-50/40 p-3 dark:border-blue-500/30 dark:bg-blue-500/[0.06]">
                <input
                  value={phraseLabel}
                  onChange={(e) => setPhraseLabel(e.target.value)}
                  maxLength={QUICK_PHRASE_LABEL_MAX_LENGTH}
                  placeholder={`按钮标签（最多 ${QUICK_PHRASE_LABEL_MAX_LENGTH} 字）`}
                  className={inputClass}
                />
                <input
                  value={phraseText}
                  onChange={(e) => setPhraseText(e.target.value)}
                  maxLength={QUICK_PHRASE_TEXT_MAX_LENGTH}
                  placeholder="追加到提示词的实际文本"
                  className={inputClass}
                />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setPhraseEditingId(null)} className="rounded-xl bg-gray-100 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1]">
                    取消
                  </button>
                  <button type="button" onClick={submitPhraseDraft} className={primaryButtonClass}>
                    {phraseEditingId === 'new' ? '添加' : '更新'}
                  </button>
                </div>
              </div>
            )}

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto custom-scrollbar pr-1 -mr-1">
              {quickPhrases.length === 0 ? (
                <div className="flex h-full min-h-[160px] items-center justify-center text-center text-xs text-gray-400 dark:text-gray-500">
                  快捷短语已清空，可点「恢复内置短语」或自己新增。
                </div>
              ) : (
                quickPhrases.map((phrase) => (
                  <div key={phrase.id} className="flex items-start gap-2 rounded-2xl border border-gray-200/70 bg-white/60 p-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{phrase.label}</div>
                      <div className="mt-1 break-words text-xs leading-relaxed text-gray-500 dark:text-gray-400">{phrase.text}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button type="button" onClick={() => appendQuickPhraseToPrompt(phrase.id)} className={primaryButtonClass}>追加</button>
                      <button type="button" onClick={() => startEditPhrase(phrase)} className={smallButtonClass} aria-label="编辑短语">
                        <EditIcon className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => removeQuickPhrase(phrase.id)} className={`${smallButtonClass} hover:text-red-500`} aria-label="删除短语">
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {activeTab === 'inspiration' && (
          <>
            <div className="mb-3">
              <input
                value={inspirationQuery}
                onChange={(e) => setInspirationQuery(e.target.value)}
                placeholder={`在 ${inspirationData?.length ?? INSPIRATION_PROMPT_COUNT} 个示例中搜索`}
                className={inputClass}
              />
            </div>
            <div className="mb-3 flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setInspirationTag(null)} className={chipClass(inspirationTag === null)}>全部</button>
              {INSPIRATION_TAGS.map((tag) => (
                <button key={tag} type="button" onClick={() => setInspirationTag(tag === inspirationTag ? null : tag)} className={chipClass(inspirationTag === tag)}>
                  {tag}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar pr-1 -mr-1">
              {inspirationLoadFailed ? (
                <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                  灵感数据加载失败
                  <button
                    type="button"
                    onClick={() => {
                      setInspirationLoadFailed(false)
                      setInspirationData(null)
                    }}
                    className={primaryButtonClass}
                  >
                    重试
                  </button>
                </div>
              ) : !inspirationData ? (
                <div className="flex h-full min-h-[160px] items-center justify-center text-xs text-gray-400 dark:text-gray-500">
                  正在加载灵感示例…
                </div>
              ) : visibleInspiration.length === 0 ? (
                <div className="flex h-full min-h-[160px] items-center justify-center text-xs text-gray-400 dark:text-gray-500">
                  没有匹配的示例
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {visibleInspiration.map((item) => {
                    const expanded = expandedInspirationId === item.id
                    const promptText = item.prompt
                    return (
                      <div key={item.id} className="flex flex-col gap-2 rounded-2xl border border-gray-200/70 bg-white/60 p-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
                        <InspirationThumb item={item} />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{item.title}</div>
                          <div className={`mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-gray-500 dark:text-gray-400 ${expanded ? '' : 'line-clamp-3'}`}>
                            {promptText}
                          </div>
                          <button
                            type="button"
                            onClick={() => setExpandedInspirationId(expanded ? null : item.id)}
                            className="mt-1 text-[11px] text-blue-500 transition-colors hover:text-blue-600 dark:text-blue-400"
                          >
                            {expanded ? '收起' : '展开全文'}
                          </button>
                        </div>
                        {item.needsReference && (
                          <div className="rounded-lg bg-amber-50 px-2 py-1 text-[11px] leading-relaxed text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                            需要参考图：{item.referenceNote}
                          </div>
                        )}
                        {item.note && expanded && (
                          <div className="rounded-lg bg-gray-50 px-2 py-1 text-[11px] leading-relaxed text-gray-500 dark:bg-white/[0.04] dark:text-gray-400">
                            {item.note}
                          </div>
                        )}
                        <div className="mt-auto flex flex-wrap items-center gap-1.5">
                          {item.tags.map((tag) => (
                            <span key={tag} className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
                              {tag}
                            </span>
                          ))}
                          {item.author && (
                            <a
                              href={item.authorLink ?? item.caseUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] text-gray-400 transition-colors hover:text-blue-500 dark:text-gray-500"
                            >
                              {item.author}
                            </a>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => useInspiration(item, promptText)} className={`${primaryButtonClass} flex-1`}>
                            直接使用
                          </button>
                          <button type="button" onClick={() => saveInspiration(item, promptText)} className="flex-1 rounded-xl bg-gray-100 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1]">
                            收藏
                          </button>
                          {item.promptEn && (
                            <button
                              type="button"
                              onClick={() => useInspiration(item, item.promptEn as string)}
                              className="rounded-xl bg-gray-100 px-2 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1]"
                            >
                              EN
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {visibleInspiration.length < filteredInspiration.length && (
                <button
                  type="button"
                  onClick={() => setInspirationLimit((limit) => limit + INSPIRATION_PAGE_SIZE)}
                  className="mt-3 w-full rounded-xl bg-gray-100 py-2 text-xs text-gray-600 transition-colors hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1]"
                >
                  加载更多（还有 {filteredInspiration.length - visibleInspiration.length} 个）
                </button>
              )}

              <p className="mt-3 text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">
                示例来自{' '}
                <a href={INSPIRATION_SOURCE.repoUrl} target="_blank" rel="noreferrer" className="text-blue-500 hover:text-blue-600 dark:text-blue-400">
                  {INSPIRATION_SOURCE.name}
                </a>
                {' '}（© {INSPIRATION_SOURCE.author} 及各案例作者，
                <a href={INSPIRATION_SOURCE.licenseUrl} target="_blank" rel="noreferrer" className="text-blue-500 hover:text-blue-600 dark:text-blue-400">
                  {INSPIRATION_SOURCE.license}
                </a>
                ）。示例图片从原仓库按需加载。
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}