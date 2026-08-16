export interface BrowserStorageEstimate {
  supported: boolean
  usage: number
  quota: number
  usageRatio: number
}

export async function getBrowserStorageEstimate(): Promise<BrowserStorageEstimate> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { supported: false, usage: 0, quota: 0, usageRatio: 0 }
  }
  const estimate = await navigator.storage.estimate()
  const usage = estimate.usage ?? 0
  const quota = estimate.quota ?? 0
  return {
    supported: true,
    usage,
    quota,
    usageRatio: quota > 0 ? Math.min(1, usage / quota) : 0,
  }
}

export function formatStorageBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** unitIndex
  return `${value >= 100 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`
}
