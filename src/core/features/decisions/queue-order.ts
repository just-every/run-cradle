import type { Direction, SortKey } from '../../../apps/launch/paging'

const priorityRank: Record<string, number> = { Critical: 0, High: 1, Medium: 2 }
/** The decision queue's order: overdue first, then priority, due time and decision ID. */
export const decisionQueueOrder = (now: number): [(item: { dueAt: string | null; priority: string; id: string }) => SortKey, Direction[]] => [
 item => { const due = item.dueAt === null ? null : Date.parse(item.dueAt); return [due !== null && due < now ? 0 : 1, priorityRank[item.priority] ?? 3, due, item.id] },
 ['asc', 'asc', 'asc', 'asc'],
]
