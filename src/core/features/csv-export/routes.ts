import type { Hono } from 'hono'
import { z } from 'zod'
import { HTTPException } from 'hono/http-exception'
import { encodeCsv } from '../../../domains/portability/csv'
import { compareKeys } from '../../../apps/launch/paging'
import type { AppEnv } from '../../app/types'
import type { Platform } from '../../platform'
import { createCampaignService } from '../campaigns/service'
import { gridQuerySchema, gridSelection, gridViewLabels } from '../campaigns/grid-query'
import { createDecisionService } from '../decisions/service'
import { decisionQueueOrder } from '../decisions/queue-order'
import { createLensRepository } from '../lenses/repository'
import { lensExport } from './lens-rows'
import { exportFilename, exportWorkspace, instant, money } from './workspace-format'

const sourceSchema = z.discriminatedUnion('source', [
 gridQuerySchema.extend({ source: z.literal('grid') }),
 z.object({ source: z.literal('lens'), lensId: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/) }),
 z.object({ source: z.literal('shipped-lens'), key: z.enum(['risks', 'timeline']) }),
 z.object({ source: z.literal('queue') }),
])
/** DATA-002: a one-way CSV of the grid, a lens or the decision queue with exactly the
 * visible fields in their displayed order and the records the current conditions select. */
export const registerExportRoutes = (app: Hono<AppEnv>, platform: Platform) => {
 const campaigns = createCampaignService(platform), decisions = createDecisionService(platform), lenses = createLensRepository(platform.database)
 app.get('/api/exports/csv', async context => {
  const query = sourceSchema.parse(context.req.query()), now = new Date(), workspace = await exportWorkspace(platform.bindings.DB, now)
  let view: string, header: string[], rows: (string | number | null)[][]
  if (query.source === 'grid') {
   const grid = gridSelection(query, context.get('session').operator.id)
   const selected = (await campaigns.list()).filter(grid.matches).sort((a, b) => compareKeys(grid.key(a), grid.key(b), grid.directions))
   view = `Campaign grid · ${gridViewLabels[query.view]}${query.phase ? ` · ${query.phase}` : ''}${query.status ? ` · ${query.status}` : ''}`
   header = ['Campaign', 'Phase', 'Owner', 'Launch', `Budget (${workspace.currency})`, 'Status', 'Risk']
   rows = selected.map(row => [row.name, row.phase, row.owner.name, row.launchDate, money(row.budgetMinor), row.status, row.riskRating])
  } else if (query.source === 'lens' || query.source === 'shipped-lens') {
   const lens = query.source === 'lens' ? await lenses.find(query.lensId) : await lenses.findShipped(query.key)
   if (!lens) throw new HTTPException(404, { message: 'This lens was not found.' })
   view = lens.name;({ header, rows } = await lensExport(platform.bindings.DB, lens, workspace))
  } else {
   const [key, directions] = decisionQueueOrder(now.getTime())
   const queue = (await decisions.list()).sort((a, b) => compareKeys(key(a), key(b), directions))
   view = 'Decision Queue'
   header = ['Priority', 'Due', 'Decision', 'Campaign']
   rows = queue.map(item => [item.priority, instant(item.dueAt, workspace.timezone), item.title, item.campaign.name])
  }
  context.header('Cache-Control', 'no-store')
  return context.json({ csv: encodeCsv(header, rows), filename: exportFilename(view, workspace), count: rows.length, view, currency: workspace.currency, timezone: workspace.timezone, capturedAt: workspace.capturedAt })
 })
}
