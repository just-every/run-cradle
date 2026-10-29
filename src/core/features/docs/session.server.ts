import { env } from 'cloudflare:workers'
import { getRequest } from '@tanstack/react-start/server'
import { createPlatform } from '../../platform'
import { createSessionReader } from '../session/service'

/** True for a request that carries a current session. A visitor without cookies is answered without reading any state. */
export async function docsSessionOpen(): Promise<boolean> {
  const request = getRequest()
  if (!request.headers.has('cookie')) return false
  return Boolean(await createSessionReader(createPlatform(env)).getIdentity(request))
}
