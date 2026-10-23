import { env } from 'cloudflare:workers'
import { getRequest, setResponseHeader } from '@tanstack/react-start/server'
import { redirect } from '@tanstack/react-router'
import { createPlatform } from '../platform'
import { createSessionReader } from '../features/session/service'
import { normalizeSignInSearch } from './screens/sign-in-search'
import { publicDocument } from './public-document.server'

export async function signInDocument(search: { returnTo?: string }) {
  setResponseHeader('cache-control', 'private, no-store')
  const session = await createSessionReader(createPlatform(env)).getIdentity(getRequest())
  if (session) throw redirect({ href: normalizeSignInSearch(search).returnTo ?? '/app' })
  return publicDocument({ identity: true })
}
