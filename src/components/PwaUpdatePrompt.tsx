import { useEffect, useState } from 'react'
import { activateWaitingServiceWorker, PWA_UPDATE_READY_EVENT } from '../lib/pwaUpdate'

export default function PwaUpdatePrompt() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null)

  useEffect(() => {
    const onReady = () => {
      void navigator.serviceWorker?.getRegistration().then((next) => setRegistration(next ?? null))
    }
    window.addEventListener(PWA_UPDATE_READY_EVENT, onReady)
    void navigator.serviceWorker?.getRegistration().then((next) => {
      if (next?.waiting) setRegistration(next)
    })
    return () => window.removeEventListener(PWA_UPDATE_READY_EVENT, onReady)
  }, [])

  if (!registration?.waiting) return null

  return (
    <div className="fixed bottom-[calc(var(--input-bar-clearance,8rem)+1rem)] left-1/2 z-[120] w-[min(92vw,28rem)] -translate-x-1/2 rounded-2xl border border-blue-200 bg-white/95 p-3 shadow-2xl backdrop-blur dark:border-blue-500/30 dark:bg-gray-900/95" role="status">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">新版本已准备好</p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">刷新后应用更新，当前本地任务和图片不会被清除。</p>
        </div>
        <button type="button" onClick={() => setRegistration(null)} className="rounded-lg px-2.5 py-2 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.06]">稍后</button>
        <button type="button" onClick={() => activateWaitingServiceWorker(registration)} className="rounded-lg bg-blue-500 px-3 py-2 text-xs font-medium text-white hover:bg-blue-600">立即刷新</button>
      </div>
    </div>
  )
}