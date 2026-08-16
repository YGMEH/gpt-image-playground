import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_COPY_IMPORT_URL_OPTIONS, readCopyImportUrlOptions, saveCopyImportUrlOptions } from './profileImportUrlOptions'

describe('profile import URL option persistence', () => {
  it('returns safe defaults for missing or invalid storage data', () => {
    expect(readCopyImportUrlOptions(null)).toEqual(DEFAULT_COPY_IMPORT_URL_OPTIONS)
    expect(readCopyImportUrlOptions({ getItem: () => '{invalid' })).toEqual(DEFAULT_COPY_IMPORT_URL_OPTIONS)
  })

  it('normalizes partial saved values while preserving the key placeholder default', () => {
    const storage = { getItem: () => JSON.stringify({ useNewApiAddress: 1 }) }
    expect(readCopyImportUrlOptions(storage)).toEqual({
      useNewApiAddress: true,
      useNewApiKey: true,
      useNewApiModel: false,
    })
  })

  it('writes only supported boolean options and reports storage failures', () => {
    const setItem = vi.fn()
    const options = { useNewApiAddress: true, useNewApiKey: false, useNewApiModel: true }
    expect(saveCopyImportUrlOptions(options, { setItem })).toBe(true)
    expect(JSON.parse(setItem.mock.calls[0][1])).toEqual(options)
    expect(saveCopyImportUrlOptions(options, { setItem: () => { throw new Error('quota') } })).toBe(false)
  })
})