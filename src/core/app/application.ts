import {installationArchiveHttp} from '../../domains/portability/installation-http.server'
import { createAuthorityRouter } from '../../domains/authority/routes'
import { authorizeLaunchProjection } from '../../apps/launch/projection-authority.server'
import { createLaunchOwnersRouter } from '../../apps/launch/owners.server'
import { createLaunchSettingsRouter } from '../../apps/launch/settings-http.server'
import { AdmissionError } from '../../domains/admission/errors'
import { createRuntime } from './composition/runtime.server'
import { ApiError, errorResponse } from '../registry/errors.server'
import { createUlid } from '../shared/ids'
import { AuthorityError } from '../../domains/authority/errors'
import { ZodError } from 'zod'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { createUserKeyService } from '../../domains/authority/user-keys.server'
import { createUserKeysHttp } from '../../domains/authority/user-keys-http.server'
import { createProposerKeyService } from '../../domains/authority/proposer-keys.server'
import { createProposerKeysHttp } from '../../domains/authority/proposer-keys-http.server'

import { registerAutomationRoutes } from '../features/automations'
import { registerCampaignRoutes } from '../features/campaigns'
import { registerDecisionRoutes } from '../features/decisions'
import { registerLensRoutes } from '../features/lenses'
import { registerMilestoneRoutes } from '../features/milestones'
import { registerPortfolioRoutes } from '../features/portfolio'
import { registerRiskRoutes } from '../features/risks'
import { registerSearchRoutes } from '../features/search'
import { registerExportRoutes } from '../features/csv-export/routes'
import { registerSessionRoutes } from '../features/session'
import type { Platform } from '../platform'
import type { SeedConfig } from '../shared/config'
import type { AppEnv } from './types'

export const createApplication = async (platform: Platform, config: SeedConfig) => {
  const app = new Hono<AppEnv>()
  const {foundation,providers,records,channels,repairIntake,automations,lifecycle,launch:launchRuntime,launchImports} = await createRuntime(platform)

  app.onError(async (error, context) => {
    if (error instanceof ApiError || error instanceof AdmissionError) return errorResponse(error, createUlid(), context.req.method + ' ' + context.req.path)
    if (error instanceof AuthorityError) return context.json({ error: { code: error.code, message: error.message } }, error.status as 400)
    if (error instanceof ZodError) return context.json({ error: { code: 'validation', message: 'Invalid request input.' } }, 400)
    if (error instanceof HTTPException) {
      const response = error.getResponse()
      const message = await response.text()
      return new Response(JSON.stringify({ error: { code: response.status === 404 ? 'not_found' : response.status === 409 ? 'conflict' : 'validation_error', message } }), {
        headers: { 'Content-Type': 'application/json' },
        status: response.status,
      })
    }
    return errorResponse(error, createUlid(), context.req.method + ' ' + context.req.path)
  })

  app.get('/health', async (context) => {
    const result = await platform.health.check()
    return result.status === 'ok'
      ? context.json({ status: 'ok', database: 'available' })
      : context.json(result, 503)
  })

  const sessions = registerSessionRoutes(app, platform)

  app.use('/api', sessions.requireSession())
  app.use('/api/*', async (context, next) => {
    if (context.req.path === '/api/v1' || context.req.path.startsWith('/api/v1/')) return next()
    return sessions.requireSession()(context, next)
  })
  app.use('/api/*', async (context, next) => {
    if (!context.req.path.startsWith('/api/v1/') && !['GET', 'HEAD', 'OPTIONS'].includes(context.req.method)) await sessions.native.requireCsrf(context.req.raw)
    await next()
  })
  app.route('/api/v1', createAuthorityRouter(platform.bindings.DB, foundation.policy, platform.auth.configuration, (request, ingress) => foundation.authenticate(request, ingress, createUlid())))
  app.route('/api/user-keys',createUserKeysHttp(
    createUserKeyService(platform.bindings.DB,foundation.policy,foundation.admission,platform.auth.configuration.appOrigin),
    request=>foundation.authenticate(request,'http',createUlid()),
  ))
  app.route('/api/proposer-keys',createProposerKeysHttp(
    createProposerKeyService(platform.bindings.DB,foundation.policy,foundation.admission,platform.auth.configuration.appOrigin),
    request=>foundation.authenticate(request,'http',createUlid()),
  ))
  app.route('/api/user-automations',automations.http)
  app.get('/api/v1/launch/usage',async c=>c.json({data:await launchRuntime.usage(await foundation.authenticate(c.req.raw,'http',createUlid())),meta:{requestId:createUlid(),apiVersion:'cradle.api.v1',evaluatedAt:new Date().toISOString(),consistencyToken:''}}))
  app.get('/api/v1/launch/analysis-requests/:id',async c=>c.json({data:await launchRuntime.analysis.request(await foundation.authenticate(c.req.raw,'http',createUlid()),c.req.param('id')),meta:{requestId:createUlid(),apiVersion:'cradle.api.v1',evaluatedAt:new Date().toISOString(),consistencyToken:''}}))
  app.get('/api/v1/launch/analyses/:id',async c=>c.json({data:await launchRuntime.analysis.get(await foundation.authenticate(c.req.raw,'http',createUlid()),c.req.param('id')),meta:{requestId:createUlid(),apiVersion:'cradle.api.v1',evaluatedAt:new Date().toISOString(),consistencyToken:''}}))
  app.route('/api/v1/launch', createLaunchOwnersRouter(platform.bindings.DB, foundation))
  app.route('/api/v1/launch', createLaunchSettingsRouter(platform.bindings.DB, foundation))
  for (const path of ['/api/v1/launch/imports', '/api/v1/launch/imports/*']) app.all(path, context => launchImports.fetch(context.req.raw))
  for (const path of ['/api/v1/connections/setup', '/api/v1/connections/:id/credentials']) app.all(path, context => providers.setupHttp.fetch(context.req.raw))
  for (const path of ['/api/v1/connections', '/api/v1/connections/:id/unknowns', '/api/v1/connections/:id/resolutions', '/api/v1/model-profiles', '/api/v1/model-calls']) app.all(path, context => providers.collectionsHttp.fetch(context.req.raw))
  for (const path of ['/api/v1/connections/:id', '/oauth/*', '/webhooks/*']) app.all(path, context => providers.connectionHttp.fetch(context.req.raw))
  for (const path of ['/api/v1/runs/*', '/api/v1/receipts/*', '/api/v1/attempts/*']) app.all(path, context => providers.http.fetch(context.req.raw))
  for (const path of ['/api/v1/sources', '/api/v1/sources/*', '/api/v1/files/*', '/api/v1/commands/upload.begin', '/api/v1/commands/upload.complete', '/api/v1/commands/source.capture', '/api/v1/commands/source.stage']) app.all(path, context => records.evidenceHttp.fetch(context.req.raw))
  for (const path of ['/api/v1/records/export-csv','/api/v1/records/import-preview','/api/v1/commands/records.import-commit']) app.all(path, context => records.csvHttp.fetch(context.req.raw))
  app.all('/api/v1/records/base-export', context => records.baseExportHttp.fetch(context.req.raw))
  app.all('/api/v1/records/base-import/*', context => records.baseImportHttp.fetch(context.req.raw))
  for (const path of ['/api/v1/records/schema-preview','/api/v1/records/bases/:appId','/api/v1/records/releases/:releaseId/recovery','/api/v1/records/releases/:releaseId/recovery/*','/api/v1/commands/release.adopt','/api/v1/records/proposals','/api/v1/records/proposals/:id','/api/v1/records/proposals/:id/decline']) app.all(path, context => records.manualHttp.fetch(context.req.raw))
  for (const path of ['/api/v1/proposals','/api/v1/proposals/*']) app.all(path, context => records.proposalHttp.fetch(context.req.raw))
  for (const path of ['/api/v1/apps', '/api/v1/apps/:appId/forms', '/api/v1/apps/:appId/entities', '/api/v1/apps/:appId/entities/*', '/api/v1/apps/:appId/views', '/api/v1/views/*', '/api/v1/forms/*']) app.all(path, context => records.http.fetch(context.req.raw))
  for (const path of ['/api/v1/history', '/api/v1/comments']) app.all(path, context => records.historyHttp.fetch(context.req.raw))
  app.all('/api/v1/repairs/intake-context', context => repairIntake.http.fetch(context.req.raw))
  for (const path of ['/api/v1/repairs/:id/completion-review','/api/v1/repairs/:id/operations','/api/v1/repairs/:id','/api/v1/decisions','/api/v1/decisions/*']) app.all(path, context => repairIntake.outcomeHttp.fetch(context.req.raw))
  for (const path of ['/api/v1/intakes/:id/open-context', '/api/v1/repairs/:id/contractors', '/api/v1/repairs/:id/quotes', '/api/v1/cases/:id', '/api/v1/mandates/:id']) app.all(path, context => repairIntake.caseHttp.fetch(context.req.raw))
  for (const path of ['/api/v1/intakes', '/api/v1/intakes/*']) app.all(path, context => repairIntake.http.fetch(context.req.raw))
  for (const path of ['/api/notifications', '/api/notifications/*', '/api/settings', '/api/workspace', '/api/v1/notifications', '/api/v1/settings', '/api/v1/preferences', '/api/v1/deliveries']) app.all(path, context => channels.http.fetch(context.req.raw))
  app.all('/mcp', context => foundation.mcp(context.req.raw))
  for(const path of ['/api/v1/commands/member.erase','/api/v1/commands/launch.campaign.delete','/api/v1/commands/launch.samples.remove','/api/v1/erasures/:id']) app.all(path,context=>lifecycle.http.fetch(context.req.raw))
  const archives=installationArchiveHttp(platform,foundation)
  for(const path of ['/api/v1/commands/export.start','/api/v1/archive-jobs/*'])app.all(path,c=>archives.fetch(c.req.raw))
  app.route('/api/v1/commands', foundation.http)
  app.get('/api/v1/actions', async context => {
    const requestId = createUlid()
    const ctx = await foundation.authenticate(context.req.raw, 'http', requestId)
    return context.json({ data: await foundation.commands.discover(ctx), meta: { requestId, apiVersion: 'cradle.api.v1', evaluatedAt: ctx.now, consistencyToken: ctx.consistencyToken ?? '' } }, 200, { 'cache-control': 'no-store', 'x-request-id': requestId })
  })

  app.get('/api/session', (context) => context.json(context.get('session')))
  app.get('/api/status', (context) => context.json({ product: config.productName, status: 'data-spine' }))

  // All retained launch HTTP reads (including generated Start resource calls)
  // share this boundary. Mutations still use canonical atomic admission below.
  const launch = new Hono<AppEnv>()
  launch.use('*', async (context, next) => {
    if (!/^\/api\/(portfolio|campaigns|deliverables|risks|milestones|lenses|decisions|automations|exports)(\/|$)/.test(context.req.path)) return next()
    const ctx = await foundation.authenticate(context.req.raw, 'http', createUlid())
    const recheck = await authorizeLaunchProjection(platform.bindings.DB, foundation.policy, ctx)
    await next()
    // Never send a prepared composite after its membership or policy changed.
    await recheck()
  })
  registerPortfolioRoutes(launch, platform)
  registerCampaignRoutes(launch, platform)
  registerRiskRoutes(launch, platform)
  registerMilestoneRoutes(launch, platform)
  registerLensRoutes(launch, platform)
  registerDecisionRoutes(launch, platform)
  registerAutomationRoutes(launch, platform)
  registerSearchRoutes(app, platform.bindings.DB, records.services, foundation.authenticate)
  registerExportRoutes(launch, platform)
  app.route('/', launch)

  app.use('/api/v1/*', async (context, next) => {
    await foundation.authenticate(context.req.raw, 'http', createUlid())
    await next()
  })
  app.all('/api', (context) => context.json({ error: { code: 'api_route_not_found', message: 'No API route matches /api.' } }, 404))
  app.all('/api/*', (context) => context.json({
    error: {
      code: 'api_route_not_found',
      message: `No API route matches ${context.req.path}.`,
    },
  }, 404))

  return app
}

export type AppType = Awaited<ReturnType<typeof createApplication>>
