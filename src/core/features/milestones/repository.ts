import type { Database } from '../shared/repository'
import { queryAll, queryOne } from '../shared/repository'
import { toInitials } from '../../shared/people'

type MilestoneRow = {
  campaignCode: string
  campaignId: string
  campaignName: string
  conflictReason: string | null
  endDate: string | null
  id: string
  ownerId: string
  ownerName: string
  startDate: string
  status: string
  title: string
  type: string
  version: number
  dependencyConflict: number
  archived: number
}

const select = `
  SELECT m.id, m.title, m.type, m.status, m.start_date AS startDate, m.end_date AS endDate, m.conflict_reason AS conflictReason, m.version,
    EXISTS(SELECT 1 FROM milestone_dependencies d JOIN milestones p ON p.id=d.predecessor_id JOIN milestones n ON n.id=d.milestone_id WHERE (d.milestone_id=m.id OR d.predecessor_id=m.id) AND n.start_date<COALESCE(p.end_date,p.start_date)) AS dependencyConflict,
    (c.archived_at IS NOT NULL) AS archived,
    c.id AS campaignId, c.code AS campaignCode, c.name AS campaignName, o.id AS ownerId, o.name AS ownerName
  FROM milestones m JOIN campaigns c ON c.id = m.campaign_id JOIN operators o ON o.id = m.owner_id
`

const map = (row: MilestoneRow, today: string) => ({
  campaign: { code: row.campaignCode, id: row.campaignId, name: row.campaignName },
  conflictReason: row.conflictReason,
  endDate: row.endDate,
  id: row.id,
  dependencyConflict: Boolean(row.dependencyConflict),
  overdue: !row.archived && row.status!=='Complete' && (row.endDate??row.startDate)<today,
  owner: { id: row.ownerId, initials: toInitials(row.ownerName), name: row.ownerName },
  predecessors: [] as Array<{ id: string, title: string }>,
  startDate: row.startDate,
  status: row.status,
  title: row.title,
  type: row.type,
  version: row.version,
})

const today=async(database:Database)=>{const settings=await queryOne<{timezone:string}>(database,'SELECT timezone FROM workspace_settings LIMIT 1');if(!settings)throw new Error('Workspace timezone is unavailable');return new Intl.DateTimeFormat('en-CA',{timeZone:settings.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}

export const createMilestoneRepository = (database: Database) => ({
  async workspaceTimezone() {
    const settings = await queryOne<{ timezone: string }>(database, 'SELECT timezone FROM workspace_settings LIMIT 1')
    return settings?.timezone
  },

  async timeline() {
    const rows = await queryAll<MilestoneRow>(database, `${select} WHERE c.archived_at IS NULL ORDER BY m.start_date ASC, c.code ASC, m.id ASC`)
    const date=await today(database);return rows.map(row=>map(row,date))
  },

  async find(id: string) {
    const row = await queryOne<MilestoneRow>(database, `${select} WHERE m.id = ?`, [id])
    if (!row) return undefined
    const predecessors = await queryAll<{ id: string, title: string, endDate: string | null }>(database, `
      SELECT predecessor.id, predecessor.title, predecessor.end_date AS endDate
      FROM milestone_dependencies dependency JOIN milestones predecessor ON predecessor.id = dependency.predecessor_id
      WHERE dependency.milestone_id = ? ORDER BY predecessor.id ASC
    `, [id])
    return { milestone: { ...map(row,await today(database)), predecessors: predecessors.map(({ id: predecessorId, title }) => ({ id: predecessorId, title })) } }
  },
})
