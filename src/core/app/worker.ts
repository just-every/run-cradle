import {companyResponse,isCompanyRequest} from '../../domains/company-identity/http.server'
import {localRuntimeBindings} from '../platform/local-auth.server'
import {firstRunResponse} from '../features/setup/server'
import {editorConfigResponse,editorDocumentHeaders} from '../features/editor/server'
import {signedOwnerClaim} from '../platform/owner-claim.server'
import { localKeyResponse } from '../platform/local-key.server'
import { dependencyResponse, isDependencyRequest } from '../platform/dependencies.server'
import { createBaseAuth, createAuthHandler } from '../platform/base-auth.server'
export { InstallationCoordinator } from '../platform/installation.server'
import { createRuntimeEvents } from './composition/events.server'
import { createRuntime } from './composition/runtime.server'
import { errorResponse } from '../registry/errors.server'
import { createUlid } from '../shared/ids'
import { configurationFaults } from '../platform/configuration'
import { checkHealth, isHealthMessage } from '../platform/health'
import start from '@tanstack/react-start/server-entry'
import { createSessionReader } from '../features/session/service'
import { createPlatform } from '../platform'
import { currentApplication } from './application-cache.server'
import { installedHomeResponse } from './installed-home.server'
import { noTransformDocument } from './document-cache.server'
import type { AppEnv } from './types'

export const isHonoRequest = (path: string) => path === '/mcp' || path.startsWith('/oauth/') || path.startsWith('/webhooks/') || path === '/health' || path === '/api' || path.startsWith('/api/') || path === '/auth' || path.startsWith('/auth/')

export default {
  async fetch(request, bindings, executionContext) {
    try {
    bindings = localRuntimeBindings(bindings)
    const url = new URL(request.url)
    if (bindings.APP_ORIGIN) {
      try {
        const expected = new URL(bindings.APP_ORIGIN).host
        if (url.host !== expected || (request.headers.has('host') && request.headers.get('host') !== expected)) return new Response('Not found', { status: 404 })
      } catch { return Response.json({ error: { code: 'unconfigured', message: 'APP_ORIGIN is invalid.' } }, { status: 503 }) }
    }
    const path = url.pathname
    if(path==='/api/editor/config')return request.method==='GET'?editorConfigResponse(request,bindings):new Response(null,{status:405,headers:{allow:'GET','cache-control':'no-store'}})
    const claim = await signedOwnerClaim(request,bindings)
    if (claim) return claim
    const keyExchange = await localKeyResponse(request, bindings)
    if (keyExchange) return keyExchange
    if (path === '/health') {
      const health = await checkHealth(bindings)
      return Response.json(health.status === 'ok' ? { status: 'ok', database: 'available', ...(bindings.RER_VERSION ? {ok:true,deployment:{sourceSha:bindings.RER_DEPLOY_SOURCE,fingerprint:bindings.RER_DEPLOY_FINGERPRINT,versionId:bindings.RER_VERSION.id}} : {}) } : health, { status: health.status === 'ok' ? 200 : 503 })
    }
    if (isCompanyRequest(path)||path==='/auth/settings/identity'&&request.method==='GET') {
      const response=await companyResponse(request,bindings,createBaseAuth(bindings))
      if(response)return response
    }
    if (isDependencyRequest(path)) {
      const response = await dependencyResponse(request, bindings, createBaseAuth(bindings))
      if (response) return response
    }
    if (path.startsWith('/auth/') && !['/auth/capabilities','/auth/request','/auth/csrf','/auth/sign-out','/auth/sessions'].includes(path) && !/^\/auth\/sessions\/[^/]+\/revoke$/.test(path)) {
      const base=createBaseAuth(bindings)!
      const response=await createAuthHandler(base)(request)
      if (response) return response
    }
    // Public document assets must remain available while sign-in explains configuration.
    if (path.startsWith('/assets/') || path.startsWith('/fonts/') || path === '/favicon.ico' || path === '/apple-touch-icon.png' || path === '/brand/mark.svg' || path === '/brand/band.svg' || path === '/rer-theme.css' || path === '/company-identity.css' || (import.meta.env.DEV && (path === '/@vite/client' || path === '/@id/virtual:tanstack-start-dev-client-entry' || path.startsWith('/@id/__x00__virtual:cradle-docs') || path.startsWith('/src/') || path.startsWith('/node_modules/.vite/deps/') || path.startsWith('/node_modules/.pnpm/') || path === '/@react-refresh' || path === '/@tanstack-start/styles.css'))) return bindings.ASSETS.fetch(request)
    // Sign-in must explain missing email setup even while the private app is unavailable.
    const missing = configurationFaults(bindings).filter(fault=>!(['/signin','/auth/request'].includes(path)&&fault.startsWith('MAIL_')))
    if (path !== '/health' && missing.length) return Response.json({ error: { code: 'unconfigured', message: 'Required installation configuration is missing or invalid.', missing } }, { status: 503 })
    const platform = createPlatform(bindings)
    if (isHonoRequest(path)) return (await currentApplication(bindings)).fetch(request, bindings, executionContext)
    if (path === '/setup' || path === '/app' || path.startsWith('/app/')) {
      const firstRun = await firstRunResponse(request, platform)
      if (firstRun) return firstRun
      if (!await createSessionReader(platform).getIdentity(request)) return platform.auth.redirectToSignIn(request)
    }


    // The installed variant: the claim state and the Lobby at /, before the document renderer.
    const home = await installedHomeResponse(request, bindings)
    if (home) return home
    const document=editorDocumentHeaders(await start.fetch(request),bindings)
    if (path === '/setup') {
      const headers=new Headers(document.headers)
      headers.set('cache-control','private, no-store, no-transform')
      headers.append('vary','Cookie')
      return new Response(document.body,{status:document.status,statusText:document.statusText,headers})
    }
    return noTransformDocument(document)

    } catch (error) { return errorResponse(error, createUlid(), 'runtime.fetch') }
  },
  async queue(batch, bindings) {
    let events: ReturnType<typeof createRuntimeEvents> | undefined
    for (const message of batch.messages) {
      if (isHealthMessage(message.body)) { message.ack(); continue }
      try {
        if (!events) {
          const platform = createPlatform(bindings)
          events = createRuntimeEvents(platform, await createRuntime(platform))
        }
        const body = message.body
        if (!body || typeof body !== 'object') throw new Error('Invalid queue envelope')
        if ('kind' in body && body.kind === 'cradle.channels.wake.v1') await events.channels()
        else if ('kind' in body && body.kind === 'cradle.launch.events.v1' && 'commandId' in body && typeof body.commandId==='string') await events.launch(body.commandId)
        else if ('kind' in body && body.kind === 'cradle.records.automations.v1' && 'commandId' in body && typeof body.commandId==='string') await events.automations(body.commandId)
        else if ('kind' in body && body.kind === 'cradle.warehouse.wake.v1') await events.warehouse()
        else if ('kind' in body && body.kind === 'cradle.outbox.v1' && 'outboxId' in body && typeof body.outboxId === 'string') await events.dispatch(body.outboxId)
        else throw new Error('Unsupported queue envelope')
        message.ack()
      } catch { message.retry({ delaySeconds: 30 }) }
    }
  },
  async scheduled(controller, bindings) {
    const platform = createPlatform(bindings)
    const clock=()=>new Date(controller.scheduledTime)
    const events = createRuntimeEvents(platform, await createRuntime(platform,clock),clock)
    await events.scheduled()
  },
} satisfies ExportedHandler<AppEnv['Bindings']>
