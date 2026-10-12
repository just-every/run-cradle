import { launchCollection } from '../../../apps/launch/paging'
import { executeLegacy } from '../../../apps/launch/legacy.server'
import type { Hono } from 'hono'

import type { AppEnv } from '../../app/types'
import type { Platform } from '../../platform'
import { parseJson, requirePathParam } from '../../shared/http'
import { collection } from '../../shared/pagination'
import { lensDefinitionSchema, lensUpdateSchema } from '../../shared/schemas'
import { createLensService } from './service'

export const registerLensRoutes = (app: Hono<AppEnv>, platform: Platform) => {
  const service = createLensService(platform)
  app.get('/api/lenses', async (context) => {
    const lenses = await service.list()
    const page=launchCollection(lenses,context.req.query('cursor'),context.req.query('limit'));return context.json({...page,lenses:page.items})
  })
  app.get('/api/lenses/:id', async (context) => {
    const id = requirePathParam(context.req.param('id'), 'lens id')
    const lens = await service.find(id)
    if (!lens) return context.json({ error: { code: 'not_found', message: `Lens ${id} was not found.` } }, 404)
    return context.json({ lens })
  })
  app.post('/api/lenses/preview', async (context) => {
    const page = await service.preview(await parseJson(context.req.raw,lensDefinitionSchema),context.req.query('cursor'))
    return context.json({records:page.items,items:page.items,cursor:page.nextCursor,total:page.total.value,totalLabel:page.total.kind==='at_least'?'10,000+':String(page.total.value)})
  })
  app.post('/api/lenses', async (context) => { const definition=await parseJson(context.req.raw,lensDefinitionSchema);const lens=await executeLegacy(platform,context.req.raw,'lens.save',{definition});return context.json({lens},201) })
  app.put('/api/lenses/:id', async (context) => {
    const input = await parseJson(context.req.raw, lensUpdateSchema)
    const { version, ...definition } = input
    const id=requirePathParam(context.req.param('id'),'lens id');await executeLegacy(platform,context.req.raw,'lens.save',{id,definition},{kind:'lens',id,version});return context.json({lens:await service.find(id)})
  })
}
