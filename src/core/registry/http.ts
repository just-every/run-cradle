import { readJsonBody } from './body'
import { Hono } from 'hono'
import { createUlid } from '../shared/ids'
import type { RequestContext } from '../../domains/authority/ports'
import type { AdmissionPort } from '../../domains/admission/ports'
import type { CommandRegistry } from './commands'
import { ApiError, errorResponse } from './errors.server'

export interface CommandTransportPorts {
  commands: CommandRegistry
  admission: AdmissionPort
  authenticate(request: Request, ingress: RequestContext['ingress'], requestId: string): Promise<RequestContext>
}

/** Authentication and CSRF occur on every invocation, including replay/status. */
export function createCommandHttp(ports: CommandTransportPorts) {
  const app = new Hono()
  app.all('*', async (context) => {
    const requestId = createUlid()
    const request = context.req.raw
    const path = new URL(request.url).pathname
    const operation = `${request.method} ${path}`
    try {
      const ctx = await ports.authenticate(request, 'http', requestId)
      if (request.method === 'POST' && request.headers.has('cookie')) {
        if (request.headers.get('origin') !== new URL(request.url).origin) throw new ApiError('forbidden', 'A same-origin request is required.')
      }
      const match = path.match(/^\/api\/v1\/commands\/([^/]+)$/)
      if (!match) throw new ApiError('not_found', 'Unknown command route.')
      if (request.method === 'GET') {
        const status = await ports.admission.status(ctx, decodeURIComponent(match[1]))
        return Response.json({ data: status, meta: { requestId, apiVersion: 'cradle.api.v1', evaluatedAt: ctx.now, consistencyToken: ctx.consistencyToken ?? '' } }, { headers: { 'cache-control': 'no-store', 'x-request-id': requestId } })
      }
      if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'GET, POST' } })
      const command = ports.commands.get(decodeURIComponent(match[1]))
      if (!command) throw new ApiError('not_found', 'Unknown command.')
      const input = await readJsonBody(request)
      const receipt = await command.execute(ctx, input)
      return Response.json({ data: receipt.result, meta: { requestId, apiVersion: 'cradle.api.v1', evaluatedAt: ctx.now, consistencyToken: receipt.consistencyToken } }, { status: receipt.result.state === 'accepted' ? 202 : 200, headers: { 'cache-control': 'no-store', 'x-request-id': requestId } })
    } catch (error) { return errorResponse(error, requestId, operation) }
  })
  return app
}
