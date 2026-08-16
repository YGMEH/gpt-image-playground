import type { TaskRecord } from '../types'

export interface TaskWorkflowMeta {
  parentTaskId?: string
  workflowGroupId: string
  workflowVersion: number
  promptVersion: number
}

export function createTaskWorkflowMeta(sourceTask: TaskRecord | null, newTaskId: string): TaskWorkflowMeta {
  if (!sourceTask) {
    return { workflowGroupId: newTaskId, workflowVersion: 1, promptVersion: 1 }
  }
  return {
    parentTaskId: sourceTask.id,
    workflowGroupId: sourceTask.workflowGroupId || sourceTask.id,
    workflowVersion: Math.max(1, sourceTask.workflowVersion || 1) + 1,
    promptVersion: Math.max(1, sourceTask.promptVersion || 1) + 1,
  }
}

export function getWorkflowTasks(tasks: TaskRecord[], task: TaskRecord) {
  const groupId = task.workflowGroupId || task.id
  return tasks
    .filter((item) => (item.workflowGroupId || item.id) === groupId)
    .sort((a, b) => (a.workflowVersion || 1) - (b.workflowVersion || 1) || a.createdAt - b.createdAt)
}

export function getTaskChildren(tasks: TaskRecord[], taskId: string) {
  return tasks.filter((task) => task.parentTaskId === taskId).sort((a, b) => a.createdAt - b.createdAt)
}