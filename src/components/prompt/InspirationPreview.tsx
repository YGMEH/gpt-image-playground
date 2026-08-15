import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { InspirationPrompt } from '../../data/inspirationSource'
import { getInspirationOriginalUrls, getInspirationThumbUrl } from '../../data/inspirationSource'
import { useCloseOnEscape } from '../../hooks/useCloseOnEscape'
import { CloseIcon } from '../icons'

interface InspirationPreviewProps {
  /** 当前可见的灵感条目（用于左右切换） */
  items: InspirationPrompt[]
  /** 当前展示的条目 id */
  activeId: string
  onActiveIdChange: (id: string) => void
  onClose: () => void
  onUse: (item: InspirationPrompt, promptText: string) => void
  /** 挂到根节点，供背景滚动锁定放行内部滚动 */
  containerRef?: RefObject<HTMLDivElement | null>
}

const navBtnClass =
  'absolute top-1/2 -translate-y-1/2 rounded-full border border-gray-200/60 bg-white/85 p-2 text-gray-700 shadow-md backdrop-blur-sm transition-colors hover:bg-white dark:border-white/15 dark:bg-black/50 dark:text-white dark:hover:bg-black/70'

/**
 * 灵感画廊大图预览层。
 *
 * 先显示随应用内置的本地缩略图（秒开），远程原图加载完成后淡入替换；
 * 原图不可用时保留缩略图，不出现空白。
 */
export default function InspirationPreview({ items, activeId, onActiveIdChange, onClose, onUse, containerRef }: InspirationPreviewProps) {
  const index = items.findIndex((item) => item.id === activeId)
  const item = index >= 0 ? items[index] : null
  const showNav = items.length > 1

  const originals = useMemo(() => (item ? getInspirationOriginalUrls(item) : []), [item])
  const [originalIndex, setOriginalIndex] = useState(0)
  const [originalLoaded, setOriginalLoaded] = useState(false)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  // 切换条目时重置原图加载状态
  useEffect(() => {
    setOriginalIndex(0)
    setOriginalLoaded(false)
  }, [activeId])

  const goTo = useCallback((offset: number) => {
    if (items.length === 0 || index < 0) return
    const next = (index + offset + items.length) % items.length
    onActiveIdChange(items[next].id)
  }, [index, items, onActiveIdChange])
  useCloseOnEscape(Boolean(item), onClose)

  useEffect(() => {
    if (!item || !showNav) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(-1) }
      if (e.key === 'ArrowRight') { e.preventDefault(); goTo(1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goTo, item, showNav])

  if (!item) return null

  const originalUrl = originals[originalIndex]

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    touchStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartRef.current
    touchStartRef.current = null
    const touch = e.changedTouches[0]
    if (!start || !touch || !showNav) return
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return
    goTo(dx < 0 ? 1 : -1)
  }

  return (
    <div
      ref={containerRef}
      data-no-drag-select
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center p-3 sm:p-6"
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm dark:bg-black/75" />

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose() }}
        className="absolute right-3 top-3 z-10 rounded-full bg-white/85 p-2 text-gray-600 shadow-md transition-colors hover:bg-white dark:bg-black/50 dark:text-white/90 dark:hover:bg-black/70 sm:right-5 sm:top-5"
        aria-label="关闭预览"
      >
        <CloseIcon className="h-5 w-5" />
      </button>

      {showNav && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); goTo(-1) }}
            className={`${navBtnClass} left-2 z-10 sm:left-5`}
            aria-label="上一张"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); goTo(1) }}
            className={`${navBtnClass} right-2 z-10 sm:right-5`}
            aria-label="下一张"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}

      <div className="relative z-10 flex max-h-full w-full max-w-4xl flex-col items-center gap-3 animate-modal-in">
        <div
          className="relative flex max-h-[68vh] w-full items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 本地缩略图：立即可见，作为原图的占位 */}
          <img
            src={getInspirationThumbUrl(item.id)}
            alt={item.title}
            decoding="async"
            className={`max-h-[68vh] max-w-full rounded-2xl object-contain shadow-2xl transition-opacity duration-200 ${originalLoaded ? 'opacity-0' : 'opacity-100'}`}
          />
          {originalUrl && (
            <img
              key={originalUrl}
              src={originalUrl}
              alt={item.title}
              decoding="async"
              referrerPolicy="no-referrer"
              onLoad={() => setOriginalLoaded(true)}
              onError={() => setOriginalIndex((i) => i + 1)}
              className={`absolute inset-0 m-auto max-h-[68vh] max-w-full rounded-2xl object-contain shadow-2xl transition-opacity duration-200 ${originalLoaded ? 'opacity-100' : 'opacity-0'}`}
            />
          )}
          {!originalLoaded && originalUrl && (
            <span className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] text-white/90">
              正在加载原图…
            </span>
          )}
        </div>

        <div
          className="w-full max-w-2xl rounded-2xl border border-white/50 bg-white/95 p-3 shadow-2xl dark:border-white/[0.08] dark:bg-gray-900/95"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{item.title}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-gray-400 dark:text-gray-500">
                {showNav && <span>{index + 1} / {items.length}</span>}
                {item.author && (
                  <a
                    href={item.authorLink ?? item.caseUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="transition-colors hover:text-blue-500"
                  >
                    {item.author}
                  </a>
                )}
                <a
                  href={item.imageUrl ?? item.caseUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="transition-colors hover:text-blue-500"
                >
                  查看原图
                </a>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onUse(item, item.prompt)}
              className="shrink-0 rounded-xl bg-blue-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-600"
            >
              直接使用
            </button>
          </div>
          <p className="mt-2 max-h-24 overflow-y-auto custom-scrollbar whitespace-pre-wrap break-words text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            {item.prompt}
          </p>
        </div>
      </div>
    </div>
  )
}
