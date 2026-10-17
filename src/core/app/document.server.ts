import { env } from 'cloudflare:workers'
import { getRequest, setResponseStatus } from '@tanstack/react-start/server'
import { isNotFound, isRedirect, notFound, redirect } from '@tanstack/react-router'
import { createSessionReader } from '../features/session/service'
import { createPlatform } from '../platform'
import { firstRunComplete } from '../features/setup/server'
import { createDocumentResourceRequest } from './document-request.server'
import { shareResolvedSession } from '../../domains/authority/base-session.server'

// A document's loaders share one admission check per (GET) request.
const admitted = new WeakMap<Request, ReturnType<typeof admitDocument>>()
export function loadDocumentSession() {
  const request = getRequest()
  if (request.method !== 'GET') return admitDocument(request)
  let pending = admitted.get(request)
  if (!pending) admitted.set(request, pending = admitDocument(request))
  return pending
}

async function admitDocument(request: Request) {
  let session, setupComplete = false
  try {
    const platform = createPlatform(env)
    session = await createSessionReader(platform).getDocumentCurrent(request)
    if (session) setupComplete = await firstRunComplete(platform.database.$client)
  } catch { throw new Error('The current session could not be read.') }
  if (!session) throw redirect({ to: '/signin' })
  if (!setupComplete) throw redirect({ to: '/setup' })
  if (session.launchAvailability === 'unavailable') setResponseStatus(500)
  return session
}

async function loadDocumentResource(path: string) {
  const { currentApplication } = await import('./application-cache.server')
  const app = await currentApplication(env)
  const request = getRequest(), resource = createDocumentResourceRequest(request, path)
  shareResolvedSession(request, resource)
  const response = await app.fetch(resource, env)
  if (response.status === 404) throw notFound()
  // Home remains useful for a records-only collaborator. Preserve the actual
  // launch denial as state; no launch rows or totals enter the document.
  if (path === '/api/portfolio' && response.status === 403) {
    const body = await response.json() as { error: { code: string, message: string } }
    if (body.error.code === 'forbidden') return { [path]: { error: { code: 'forbidden', message: body.error.message } } }
  }
  if (response.status === 403) throw notFound()
  if (!response.ok) throw new Error('The current page data could not be read.')
  return { [path]: await response.json() as JsonValue }
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

export async function loadDocumentResources(paths: string[]) {
  try {
    const session = await loadDocumentSession()
    if (session.launchAvailability === 'unavailable') throw new Error('The current page data could not be read.')
    return Object.assign({}, ...await Promise.all(paths.map(loadDocumentResource)))
  } catch (error) {
    if (isNotFound(error) || isRedirect(error)) throw error
    throw new Error('The current page data could not be read.')
  }
}
