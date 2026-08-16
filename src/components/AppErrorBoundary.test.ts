import { describe, expect, it } from 'vitest'
import { isLikelyChunkLoadError } from './AppErrorBoundary'

describe('AppErrorBoundary error classification', () => {
  it('recognizes stale lazy-loaded module failures', () => {
    expect(isLikelyChunkLoadError(new Error('Failed to fetch dynamically imported module: /assets/Settings.js'))).toBe(true)
    expect(isLikelyChunkLoadError(new Error('ChunkLoadError: Loading chunk 12 failed'))).toBe(true)
  })

  it('does not classify ordinary render failures as chunk failures', () => {
    expect(isLikelyChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false)
  })
})