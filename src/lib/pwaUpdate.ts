export const PWA_UPDATE_READY_EVENT = 'gpt-image-playground:pwa-update-ready'

export function notifyPwaUpdateReady() {
  window.dispatchEvent(new CustomEvent(PWA_UPDATE_READY_EVENT))
}

export function activateWaitingServiceWorker(registration: ServiceWorkerRegistration) {
  registration.waiting?.postMessage({ type: 'SKIP_WAITING' })
}

/** 注册更新监听；返回清理函数，避免开发热更新或测试重复绑定。 */
export function watchServiceWorkerUpdates(registration: ServiceWorkerRegistration) {
  let refreshing = false
  const shouldReloadOnControllerChange = Boolean(navigator.serviceWorker.controller)
  const onControllerChange = () => {
    // 首次安装也会获得 controller，但不应因此强制刷新；仅替换已有版本时刷新。
    if (!shouldReloadOnControllerChange || refreshing) return
    refreshing = true
    window.location.reload()
  }
  const onUpdateFound = () => {
    const worker = registration.installing
    if (!worker) return
    const onStateChange = () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) notifyPwaUpdateReady()
    }
    worker.addEventListener('statechange', onStateChange)
  }

  navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
  registration.addEventListener('updatefound', onUpdateFound)
  if (registration.waiting && navigator.serviceWorker.controller) notifyPwaUpdateReady()

  return () => {
    navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
    registration.removeEventListener('updatefound', onUpdateFound)
  }
}