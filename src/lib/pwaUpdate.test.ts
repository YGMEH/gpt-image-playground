// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  activateWaitingServiceWorker,
  notifyPwaUpdateReady,
  PWA_UPDATE_READY_EVENT,
  watchServiceWorkerUpdates,
} from './pwaUpdate'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('PWA update lifecycle', () => {
  it('notifies the UI when an update is ready', () => {
    const listener = vi.fn()
    window.addEventListener(PWA_UPDATE_READY_EVENT, listener, { once: true })
    notifyPwaUpdateReady()
    expect(listener).toHaveBeenCalledOnce()
  })

  it('asks the waiting worker to activate', () => {
    const postMessage = vi.fn()
    activateWaitingServiceWorker({ waiting: { postMessage } } as unknown as ServiceWorkerRegistration)
    expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
  })

  it('reports an already waiting update and cleans up listeners', () => {
    const serviceWorker = new EventTarget() as ServiceWorkerContainer
    Object.defineProperty(serviceWorker, 'controller', { value: {} })
    vi.stubGlobal('navigator', { serviceWorker })

    const registration = new EventTarget() as ServiceWorkerRegistration
    Object.defineProperty(registration, 'waiting', { value: {} })
    const listener = vi.fn()
    window.addEventListener(PWA_UPDATE_READY_EVENT, listener)

    const cleanup = watchServiceWorkerUpdates(registration)
    expect(listener).toHaveBeenCalledOnce()

    cleanup()
    listener.mockClear()
    registration.dispatchEvent(new Event('updatefound'))
    expect(listener).not.toHaveBeenCalled()
    window.removeEventListener(PWA_UPDATE_READY_EVENT, listener)
  })
})
