import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, type AppSettings, type TaskRecord } from '../types'
import { GRSAI_CONSUMPTION_LOG_URL, isGrsaiTask, shouldShowGrsaiTaskLink } from './grsaiTask'

function task(patch: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 'task-1', prompt: 'test', params: { ...DEFAULT_PARAMS },
    inputImageIds: [], outputImages: [], status: 'error', error: 'failed', createdAt: 1, finishedAt: 2, elapsed: 1, ...patch,
  }
}

describe('Grsai task recovery link', () => {
  it('uses the configured consumption log URL', () => {
    expect(GRSAI_CONSUMPTION_LOG_URL).toBe('https://nkxx.grsai.ai/zh/dashboard/consumption-log')
  })

  it('recognizes Grsai from non-sensitive task metadata and only links errors', () => {
    expect(isGrsaiTask(task({ apiBaseUrl: 'https://grsai.dakka.com.cn/v1' }))).toBe(true)
    expect(isGrsaiTask(task({ apiBaseUrl: 'https://grsaiapi.com/v1' }))).toBe(true)
    expect(isGrsaiTask(task({ error: 'request failed at api.grsai.ai' }))).toBe(true)
    expect(shouldShowGrsaiTaskLink(task({ apiProfileName: 'Grsai 中转站' }))).toBe(true)
    expect(shouldShowGrsaiTaskLink(task({ apiBaseUrl: 'https://grsai.example', status: 'done' }))).toBe(false)
  })

  it('falls back to the current profile for legacy tasks', () => {
    const settings = { profiles: [{ id: 'profile-1', name: 'Dakka', baseUrl: 'https://api.dakka.com.cn/v1' }] } as AppSettings
    expect(isGrsaiTask(task({ apiProfileId: 'profile-1', apiBaseUrl: undefined }), settings)).toBe(true)
    expect(isGrsaiTask(task({ apiProfileId: 'other', apiBaseUrl: 'https://example.com/v1' }), settings)).toBe(false)
  })
})