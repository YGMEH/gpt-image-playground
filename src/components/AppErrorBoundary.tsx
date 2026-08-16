import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

export function isLikelyChunkLoadError(error: Error) {
  return /chunk|dynamically imported module|importing a module script|failed to fetch/i.test(error.message)
}

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Application render failed:', error, info)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const likelyChunkError = isLikelyChunkLoadError(error)
    return (
      <main className="safe-area-x flex min-h-dvh items-center justify-center bg-gray-50 px-5 py-12 text-gray-800 dark:bg-gray-950 dark:text-gray-100" role="alert">
        <section className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-xl dark:border-white/10 dark:bg-gray-900">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-xl dark:bg-amber-500/15">!</div>
          <h1 className="text-lg font-semibold">{likelyChunkError ? '应用版本已更新' : '页面遇到异常'}</h1>
          <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
            {likelyChunkError
              ? '当前页面资源可能已过期，刷新即可加载最新版本，本地任务和图片不会被清除。'
              : '应用未能正常显示。你可以先刷新重试；本地保存的任务和图片不会因此被删除。'}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-600"
          >
            刷新应用
          </button>
          {!likelyChunkError && (
            <details className="mt-4 text-left text-xs text-gray-400">
              <summary className="cursor-pointer text-center">查看错误信息</summary>
              <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-gray-50 p-2 dark:bg-black/20">{error.message}</pre>
            </details>
          )}
        </section>
      </main>
    )
  }
}
