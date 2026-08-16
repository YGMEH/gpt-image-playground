import { describe, expect, it } from 'vitest'
import type { TaskRecord } from '../types'
import { createTaskWorkflowMeta, getTaskChildren, getWorkflowTasks } from './taskWorkflow'

const task = (id: string, patch: Partial<TaskRecord> = {}) => ({
  id, prompt: id, params: {} as TaskRecord['params'], inputImageIds: [], outputImages: [], status: 'done' as const,
  error: null, createdAt: Number(id.replace(/\D/g, '')) || 1, finishedAt: null, elapsed: null, ...patch,
})

describe('task workflow metadata', () => {
  it('starts standalone tasks at version one', () => {
    expect(createTaskWorkflowMeta(null, 'new')).toEqual({ workflowGroupId: 'new', workflowVersion: 1, promptVersion: 1 })
  })

  it('creates a child in the source workflow and supports legacy sources', () => {
    expect(createTaskWorkflowMeta(task('source'), 'child')).toEqual({
      parentTaskId: 'source', workflowGroupId: 'source', workflowVersion: 2, promptVersion: 2,
    })
  })

  it('orders a workflow and finds direct children', () => {
    const root = task('1', { workflowGroupId: '1', workflowVersion: 1 })
    const child = task('2', { parentTaskId: '1', workflowGroupId: '1', workflowVersion: 2 })
    const other = task('3')
    expect(getWorkflowTasks([child, other, root], child).map((item) => item.id)).toEqual(['1', '2'])
    expect(getTaskChildren([other, child, root], '1').map((item) => item.id)).toEqual(['2'])
  })
})