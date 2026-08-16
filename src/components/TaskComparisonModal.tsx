import { useEffect, useState } from 'react'
import type { TaskRecord } from '../types'
import { ensureImageCached, getCachedImage } from '../lib/imageCache'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import { CloseIcon } from './icons'

interface Props {
  leftTask: TaskRecord
  rightTask: TaskRecord
  onClose: () => void
}

export default function TaskComparisonModal({ leftTask, rightTask, onClose }: Props) {
  const [sources, setSources] = useState<Record<string, string>>({})
  useCloseOnEscape(true, onClose)
  usePreventBackgroundScroll(true)

  useEffect(() => {
    let cancelled = false
    const ids = [leftTask.outputImages[0], rightTask.outputImages[0]].filter(Boolean)
    setSources(Object.fromEntries(ids.map((id) => [id, getCachedImage(id) || ''])))
    ids.forEach((id) => {
      void ensureImageCached(id).then((source) => {
        if (!cancelled && source) setSources((current) => ({ ...current, [id]: source }))
      })
    })
    return () => { cancelled = true }
  }, [leftTask, rightTask])

  const panels = [leftTask, rightTask]
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/55 backdrop-blur-md" />
      <section className="relative z-10 flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-gray-950 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-3 text-white">
          <div>
            <h2 className="text-sm font-semibold">双图比较</h2>
            <p className="text-xs text-white/50">并排核对方案版本、模型和提示词差异</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-white/60 hover:bg-white/10 hover:text-white" aria-label="关闭比较"><CloseIcon className="h-5 w-5" /></button>
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-2 md:overflow-hidden">
          {panels.map((task, index) => {
            const imageId = task.outputImages[0]
            return (
              <article key={task.id} className={`flex min-h-[22rem] flex-col p-4 ${index ? 'border-t border-white/10 md:border-l md:border-t-0' : ''}`}>
                <div className="mb-3 flex items-center justify-between text-xs text-white/60">
                  <span className="font-semibold text-white">{index ? '对比版本' : '当前版本'} · v{task.workflowVersion || 1}</span>
                  <span>{task.apiModel || '未知模型'}</span>
                </div>
                <div className="flex min-h-[16rem] flex-1 items-center justify-center overflow-hidden rounded-2xl bg-black/40">
                  {imageId && sources[imageId] ? <img src={sources[imageId]} data-image-id={imageId} className="max-h-full max-w-full object-contain" alt="" /> : <span className="text-xs text-white/40">暂无可比较图片</span>}
                </div>
                <p className="mt-3 max-h-24 overflow-auto whitespace-pre-wrap text-xs leading-5 text-white/65">{task.prompt || '(无提示词)'}</p>
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}