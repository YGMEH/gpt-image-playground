import { describe, expect, it } from 'vitest'
import type { TaskRecord } from '../types'
import { estimateTaskCost, formatTaskCost } from './taskCost'

const params = (n: number) => ({ n } as TaskRecord['params'])

describe('task cost estimate', () => {
  it('estimates confirmed common model prices', () => {
    expect(estimateTaskCost({ apiModel: 'gpt-image-2', params: params(2) })).toMatchObject({ unitPrice: 0.06, requestedImages: 2, estimatedTotal: 0.12 })
    expect(estimateTaskCost({ apiModel: 'nano-banana-2', params: params(1) })?.estimatedTotal).toBe(0.12)
    expect(estimateTaskCost({ apiModel: 'nano-banana-pro', params: params(3) })?.estimatedTotal).toBe(0.54)
  })

  it('does not guess prices for variants or unknown models', () => {
    expect(estimateTaskCost({ apiModel: 'nano-banana-2-4k-cl', params: params(1) })).toBeNull()
    expect(estimateTaskCost({ apiModel: 'custom-model', params: params(1) })).toBeNull()
  })

  it('formats the estimate as an explicitly approximate total', () => {
    const estimate = estimateTaskCost({ apiModel: 'gpt-image-2', params: params(2) })!
    expect(formatTaskCost(estimate)).toBe('≈ $0.12 (2 × $0.06)')
  })
})