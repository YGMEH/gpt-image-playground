import type { TaskRecord } from '../types'

export interface TaskCostEstimate {
  currency: 'USD'
  unitPrice: number
  requestedImages: number
  estimatedTotal: number
  basis: string
}

/** 用户确认的常用模型参考价；自定义后缀和未知服务商不猜价。 */
export function estimateTaskCost(task: Pick<TaskRecord, 'apiModel' | 'params'>): TaskCostEstimate | null {
  const model = (task.apiModel || '').trim().toLowerCase()
  let unitPrice = 0
  let basis = ''
  if (model === 'gpt-image-2' || model === 'openai/gpt-image-2') {
    unitPrice = 0.06
    basis = 'gpt-image-2 参考价'
  } else if (model === 'nano-banana-2') {
    unitPrice = 0.12
    basis = 'nano-banana-2 参考价'
  } else if (model === 'nano-banana-pro') {
    unitPrice = 0.18
    basis = 'nano-banana-pro 参考价'
  } else {
    return null
  }
  const requestedImages = Math.max(1, Math.floor(task.params.n || 1))
  return {
    currency: 'USD',
    unitPrice,
    requestedImages,
    estimatedTotal: Number((unitPrice * requestedImages).toFixed(4)),
    basis,
  }
}

export function formatTaskCost(estimate: TaskCostEstimate) {
  return `≈ $${estimate.estimatedTotal.toFixed(2)} (${estimate.requestedImages} × $${estimate.unitPrice.toFixed(2)})`
}