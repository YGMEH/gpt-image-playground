import 'core-js/actual/array/at'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import 'streamdown/styles.css'
import 'katex/dist/katex.min.css'
import './index.css'
import { installMobileViewportGuards } from './lib/viewport'
import { watchServiceWorkerUpdates } from './lib/pwaUpdate'
import AppErrorBoundary from './components/AppErrorBoundary'
import PwaUpdatePrompt from './components/PwaUpdatePrompt'

installMobileViewportGuards()

if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}sw.js`)
        .then((registration) => watchServiceWorkerUpdates(registration))
        .catch((error) => {
          console.error('Service worker registration failed:', error)
        })
    })
  } else {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => registration.unregister())
    })
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
      <PwaUpdatePrompt />
    </AppErrorBoundary>
  </StrictMode>,
)
