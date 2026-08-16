import type { AppSettings, TaskRecord } from '../types'

export const GRSAI_CONSUMPTION_LOG_URL = 'https://nkxx.grsai.ai/zh/dashboard/consumption-log'

const GRSAI_MARKER = /(?:grsai|dakka\.com\.cn)/i

/** 仅使用非敏感元数据识别 Grsai；不会读取或暴露 API Key。 */
export function isGrsaiTask(task: TaskRecord, settings?: AppSettings) {
  if (GRSAI_MARKER.test(task.apiBaseUrl ?? '') || GRSAI_MARKER.test(task.apiProfileName ?? '')) return true
  const profile = settings?.profiles.find((item) => item.id === task.apiProfileId)
  if (profile && (GRSAI_MARKER.test(profile.baseUrl) || GRSAI_MARKER.test(profile.name))) return true
  return GRSAI_MARKER.test(task.error ?? '') || task.rawImageUrls?.some((url) => GRSAI_MARKER.test(url)) === true
}

export function shouldShowGrsaiTaskLink(task: TaskRecord, settings?: AppSettings) {
  return task.status === 'error' && isGrsaiTask(task, settings)
}
