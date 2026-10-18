import type { RecordRow } from '../../domains/records/contracts'
import type { TimelineTask } from './timeline-model'

export type TimelineLine = { kind: 'group'; key: string; row: RecordRow } | { kind: 'task'; task: TimelineTask }
export function timelineLines(tasks: TimelineTask[], groupBy: string[]): TimelineLine[] {
  if (!groupBy.length) return tasks.map(task => ({ kind: 'task', task }))
  const groups = new Map<string, TimelineTask[]>()
  for (const task of tasks) {
    const key = JSON.stringify(groupBy.map(id => task.row.fields[id] ?? null))
    const group = groups.get(key)
    if (group) group.push(task); else groups.set(key, [task])
  }
  return [...groups].flatMap(([key, tasks]) => [{ kind: 'group', key, row: tasks[0]!.row } as TimelineLine, ...tasks.map(task => ({ kind: 'task' as const, task }))])
}
