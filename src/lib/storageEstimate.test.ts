import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatStorageBytes, getBrowserStorageEstimate } from './storageEstimate'

afterEach(() => vi.unstubAllGlobals())

describe('browser storage estimate', () => {
  it('normalizes usage, quota and ratio', async () => {
    vi.stubGlobal('navigator', { storage: { estimate: vi.fn().mockResolvedValue({ usage: 256, quota: 1024 }) } })
    await expect(getBrowserStorageEstimate()).resolves.toEqual({ supported: true, usage: 256, quota: 1024, usageRatio: 0.25 })
  })

  it('formats storage byte values', () => {
    expect(formatStorageBytes(0)).toBe('0 B')
    expect(formatStorageBytes(1536)).toBe('1.5 KB')
    expect(formatStorageBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})