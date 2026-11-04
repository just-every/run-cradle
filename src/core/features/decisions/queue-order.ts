import type { Direction, SortKey } from '../../../apps/launch/paging'

const priorityRank: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 }
/** The queue uses recorded creation time before the final unique ID tiebreak. */
export const decisionQueueOrder = (now: number): [(item: { dueAt: string | null; createdAt: string | null; priority: string; id: string }) => SortKey, Direction[]] => [
 item => {
  const due = item.dueAt === null ? null : Date.parse(item.dueAt)
  const created = item.createdAt === null ? null : Date.parse(item.createdAt)
  return [due !== null && due < now ? 0 : 1, priorityRank[item.priority] ?? 3, due, created, item.id]
 },
 ['asc', 'asc', 'asc', 'asc', 'asc'],
]
