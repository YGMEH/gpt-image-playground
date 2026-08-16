import type { CopyImportUrlOptions } from '../components/settings/ProfileImportUrlModal'

const STORAGE_KEY = 'gpt-image-playground.copy-import-url-options'

export const DEFAULT_COPY_IMPORT_URL_OPTIONS: CopyImportUrlOptions = {
  useNewApiAddress: false,
  useNewApiKey: true,
  useNewApiModel: false,
}

export function readCopyImportUrlOptions(storage: Pick<Storage, 'getItem'> | null = typeof window === 'undefined' ? null : window.localStorage): CopyImportUrlOptions {
  if (!storage) return { ...DEFAULT_COPY_IMPORT_URL_OPTIONS }
  try {
    const saved = storage.getItem(STORAGE_KEY)
    if (!saved) return { ...DEFAULT_COPY_IMPORT_URL_OPTIONS }
    const parsed = JSON.parse(saved) as Partial<CopyImportUrlOptions> | null
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_COPY_IMPORT_URL_OPTIONS }
    return {
      useNewApiAddress: Boolean(parsed.useNewApiAddress),
      useNewApiKey: parsed.useNewApiKey === undefined ? true : Boolean(parsed.useNewApiKey),
      useNewApiModel: Boolean(parsed.useNewApiModel),
    }
  } catch {
    return { ...DEFAULT_COPY_IMPORT_URL_OPTIONS }
  }
}

export function saveCopyImportUrlOptions(
  options: CopyImportUrlOptions,
  storage: Pick<Storage, 'setItem'> | null = typeof window === 'undefined' ? null : window.localStorage,
) {
  if (!storage) return false
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({
      useNewApiAddress: options.useNewApiAddress,
      useNewApiKey: options.useNewApiKey,
      useNewApiModel: options.useNewApiModel,
    }))
    return true
  } catch {
    return false
  }
}