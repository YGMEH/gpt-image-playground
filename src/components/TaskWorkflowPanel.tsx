import { useMemo, useState } from 'react'
import type { TaskRecord } from '../types'
import { estimateTaskCost, formatTaskCost } from '../lib/taskCost'
import { getTaskChildren, getWorkflowTasks } from '../lib/taskWorkflow'
import TaskComparisonModal from './TaskComparisonModal'

interface Props {
  task: TaskRecord
  tasks: TaskRecord[]
  onOpenTask: (taskId: string) => void
}

export default function TaskWorkflowPanel({ task, tasks, onOpenTask }: Props) {
  const workflowTasks = useMemo(() => getWorkflowTasks(tasks, task), [task, tasks])
  const children = useMemo(() => getTaskChildren(tasks, task.id), [task.id, tasks])
  const parent = task.parentTaskId ? tasks.find((item) => item.id === task.parentTaskId) ?? null : null
  const comparableTasks = workflowTasks.filter((item) => item.id !== task.id && item.status === 'done' && item.outputImages.length > 0)
  const [comparisonTaskId, setComparisonTaskId] = useState<string | null>(null)
  const comparisonTask = comparisonTaskId ? tasks.find((item) => item.id === comparisonTaskId) ?? null : null
  const estimate = estimateTaskCost(task)

  return (
    <>
      <section className="mb-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-3 dark:border-blue-500/15 dark:bg-blue-500/[0.06]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-300">方案与复现</h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">方案 v{task.workflowVersion || 1} · 提示词 v{task.promptVersion || 1} · 共 {workflowTasks.length} 个版本</p>
          </div>
          {estimate && <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-emerald-600 shadow-sm dark:bg-white/[0.06] dark:text-emerald-300" title={`${estimate.basis}，仅为估算，实际以服务商账单为准`}>{formatTaskCost(estimate)}</span>}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {parent && <button type="button" onClick={() => onOpenTask(parent.id)} className="rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 text-xs text-blue-600 hover:bg-blue-50 dark:border-blue-400/20 dark:bg-white/[0.04] dark:text-blue-300">查看父版本 v{parent.workflowVersion || 1}</button>}
          {children.map((child) => <button key={child.id} type="button" onClick={() => onOpenTask(child.id)} className="rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 text-xs text-blue-600 hover:bg-blue-50 dark:border-blue-400/20 dark:bg-white/[0.04] dark:text-blue-300">派生 v{child.workflowVersion || 1}</button>)}
          {comparableTasks.length > 0 && (
            <select value={comparisonTaskId || ''} onChange={(event) => setComparisonTaskId(event.target.value || null)} className="rounded-lg border border-purple-200 bg-white px-2.5 py-1.5 text-xs text-purple-600 outline-none dark:border-purple-400/20 dark:bg-gray-900 dark:text-purple-300" aria-label="选择双图比较版本">
              <option value="">双图比较…</option>
              {comparableTasks.map((item) => <option key={item.id} value={item.id}>与 v{item.workflowVersion || 1} 比较 · {item.apiModel || '未知模型'}</option>)}
            </select>
          )}
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-blue-100 pt-2 text-[11px] dark:border-blue-400/10">
          <dt className="text-gray-400">模型</dt><dd className="truncate text-right text-gray-600 dark:text-gray-300" title={task.apiModel}>{task.apiModel || '未知'}</dd>
          <dt className="text-gray-400">API 模式</dt><dd className="text-right text-gray-600 dark:text-gray-300">{task.apiMode || '未知'}</dd>
          <dt className="text-gray-400">请求输出</dt><dd className="text-right text-gray-600 dark:text-gray-300">{task.params.n} 张 · {task.params.size}</dd>
          <dt className="text-gray-400">参考图</dt><dd className="text-right text-gray-600 dark:text-gray-300">{task.inputImageIds.length} 张{task.maskImageId ? ' · 含遮罩' : ''}</dd>
        </dl>
        {estimate && <p className="mt-2 text-[10px] text-gray-400">成本为参考估算，未知模型不显示；实际价格以服务商账单为准。</p>}
      </section>
      {comparisonTask && <TaskComparisonModal leftTask={task} rightTask={comparisonTask} onClose={() => setComparisonTaskId(null)} />}
    </>
  )
}