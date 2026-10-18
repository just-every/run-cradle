import type { RecordRow, View } from '../../domains/records/contracts'

export type TimelineTask = { row: RecordRow; start: number | null; end: number | null; duration: number; predecessors: string[]; issues: string[] }
export type TimelineEdge = { from: string; to: string; conflict: boolean; critical: boolean }
export type TimelineSchedule = { tasks: TimelineTask[]; edges: TimelineEdge[]; critical: Set<string>; duration: number; complete: boolean; problems: string[] }
const time = (row: RecordRow, field: string | undefined) => {
  const cell = field ? row.fields[field] : null
  if (cell?.state !== 'value' || typeof cell.value !== 'string') return null
  const value = Date.parse(cell.value)
  return Number.isFinite(value) ? value : null
}

/** CPM uses elapsed task durations, not placement or the longest drawn span. */
export function timelineSchedule(rows: RecordRow[], view: View, dependenciesComplete = true): TimelineSchedule {
  const dependency = view.layout.dependencyFieldId
  const tasks = rows.map(row => {
    const start = time(row, view.layout.startFieldId), end = time(row, view.layout.endFieldId) ?? start, issues: string[] = []
    if (start === null) issues.push('Unscheduled: start date is unavailable')
    if (view.layout.endFieldId && row.fields[view.layout.endFieldId]?.state !== 'value') issues.push('End date is unavailable')
    if (start !== null && end !== null && end < start) issues.push('End date precedes start date')
    const cell = dependency ? row.fields[dependency] : null
    const predecessors: string[] = []
    if (dependency && cell?.state !== 'value') issues.push('Dependencies are unavailable')
    if (dependency && cell?.state === 'value' && cell.value !== null) {
      const refs = Array.isArray(cell.value) ? cell.value : [cell.value]
      for (const ref of refs) {
        if (!ref || typeof ref !== 'object' || !('recordId' in ref) || !('appId' in ref) || !('entityId' in ref) || ref.appId !== row.ref.appId || ref.entityId !== row.ref.entityId) issues.push('Dependency does not target this table')
        else predecessors.push(String(ref.recordId))
      }
    }
    return { row, start, end, duration: start === null || end === null ? 0 : Math.max(0, end - start), predecessors: [...new Set(predecessors)], issues }
  })
  const byId = new Map(tasks.map(task => [task.row.id, task])), edges: TimelineEdge[] = []
  const next = new Map(tasks.map(task => [task.row.id, [] as string[]])), degree = new Map(tasks.map(task => [task.row.id, 0]))
  for (const task of tasks) for (const id of task.predecessors) {
    const prior = byId.get(id)
    if (!prior) { task.issues.push('A dependency is outside this view or unavailable'); continue }
    const conflict = prior.end !== null && task.start !== null && task.start < prior.end
    if (conflict) task.issues.push('Starts before a predecessor ends')
    edges.push({ from: id, to: task.row.id, conflict, critical: false })
    next.get(id)!.push(task.row.id); degree.set(task.row.id, degree.get(task.row.id)! + 1)
  }
  const ordered: TimelineTask[] = [], queue = tasks.filter(task => !degree.get(task.row.id))
  for (let index = 0; index < queue.length; index++) {
    const task = queue[index]!; ordered.push(task)
    for (const id of next.get(task.row.id)!) { degree.set(id, degree.get(id)! - 1); if (!degree.get(id)) queue.push(byId.get(id)!) }
  }
  const problems: string[] = []
  if (dependency && !dependenciesComplete) problems.push('Critical path requires complete row visibility. Your current access may hide predecessor links; only permitted dependencies are shown.')
  if (ordered.length !== tasks.length) {
    problems.push('Dependency cycle detected. Critical path is unavailable until the cycle is removed.')
    for (const task of tasks) if (degree.get(task.row.id)) task.issues.push('Dependency cycle or blocked by a cycle')
  }
  if (tasks.some(task => task.issues.some(issue => issue !== 'Starts before a predecessor ends' && !issue.startsWith('Dependency cycle')))) problems.push('Some dates or dependencies are unavailable or invalid. Critical path requires every predecessor in this view and valid planned dates.')
  const critical = new Set<string>(), complete = !problems.length
  let duration = 0
  if (dependency && complete) {
    const early = new Map<string, number>(), late = new Map<string, number>()
    for (const task of ordered) {
      const start = task.predecessors.reduce((max, id) => Math.max(max, early.get(id)! + byId.get(id)!.duration), 0)
      early.set(task.row.id, start); duration = Math.max(duration, start + task.duration)
    }
    for (const task of [...ordered].reverse()) {
      const following = next.get(task.row.id)!
      const finish = following.length ? Math.min(...following.map(id => late.get(id)!)) : duration
      const start = finish - task.duration; late.set(task.row.id, start)
      if (Math.abs(start - early.get(task.row.id)!) < .001) critical.add(task.row.id)
    }
    for (const edge of edges) edge.critical = critical.has(edge.from) && critical.has(edge.to) && Math.abs(early.get(edge.to)! - early.get(edge.from)! - byId.get(edge.from)!.duration) < .001
  }
  return { tasks, edges, critical, duration, complete, problems }
}
