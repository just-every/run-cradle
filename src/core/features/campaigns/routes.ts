import { z } from 'zod'
import { campaignLifecycle } from '../../../apps/launch/lifecycle'
import { launchCollection } from '../../../apps/launch/paging'
import { executeLegacy } from '../../../apps/launch/legacy.server'
import type { Hono } from 'hono'

import type { AppEnv } from '../../app/types'
import { collection } from '../../shared/pagination'
import { campaignPatchSchema, deliverableToggleSchema } from '../../shared/schemas'
import { parseJson, requirePathParam } from '../../shared/http'
import type { Platform } from '../../platform'
import { createCampaignService } from './service'

export const registerCampaignRoutes = (app: Hono<AppEnv>, platform: Platform) => {
  const service = createCampaignService(platform)

  app.get('/api/campaigns', async (context) => {
    const query=z.object({view:z.enum(['all','launch-prep','mine']).default('all'),phase:z.enum(campaignLifecycle.phases).optional(),status:z.enum(campaignLifecycle.statuses).optional(),sort:z.enum(['launchDate','name','health']).default('launchDate'),direction:z.enum(['asc','desc']).default('asc'),cursor:z.string().optional(),limit:z.string().optional()}).parse(context.req.query())
    const rows=(await service.list()).filter(row=>(!query.phase || row.phase===query.phase)&&(!query.status || row.status===query.status)&&(query.view!=='launch-prep' || row.phase===campaignLifecycle.launchPreparationPhase)&&(query.view!=='mine' || row.owner.id===context.get('session').operator.id))
    rows.sort((a,b)=>{const compared=query.sort==='health' ? (a.health ?? -1)-(b.health ?? -1) : String(a[query.sort]).localeCompare(String(b[query.sort]));return (query.direction==='desc'?-compared:compared)||a.id.localeCompare(b.id)})
    return context.json(launchCollection(rows,query.cursor,query.limit))
  })
  app.get('/api/campaigns/:id', async (context) => context.json(await service.detail(requirePathParam(context.req.param('id'), 'campaign id'))))
  app.patch('/api/campaigns/:id', async (context) => {
    const input = await parseJson(context.req.raw, campaignPatchSchema.extend({ phase:z.enum(campaignLifecycle.phases).optional(), status:z.enum(campaignLifecycle.statuses).optional(), objective:z.string().max(100000).optional() }))
    const { version, ...changes } = input
    const id = requirePathParam(context.req.param('id'), 'campaign id')
    await executeLegacy(platform, context.req.raw, 'campaign.patch', {id,changes}, {kind:'campaign',id,version})
    const updated = await service.detail(id)
    return context.json({ campaign: updated.campaign })
  })
  app.post('/api/deliverables/:id/toggle-completion', async (context) => {
    const input = await parseJson(context.req.raw, deliverableToggleSchema)
    const id = requirePathParam(context.req.param('id'), 'deliverable id')
    const deliverable = await service.deliverable(id)
    await executeLegacy(platform,context.req.raw,deliverable.state==='Complete'?'deliverable.reopen':'deliverable.complete',{id},{kind:'deliverable',id,version:input.version})
    return context.json({deliverable:await service.deliverable(id)})
  })
}
