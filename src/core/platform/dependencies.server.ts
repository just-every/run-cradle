import { createIdpOwnerClaimHandler } from '../../../vendor/base/modules/owner-claim/index.mjs'
import { createDependencies } from '../../../vendor/base/modules/dependencies/index.mjs'
import { securityHeaders, type OperatorAuth } from '../../../vendor/base/modules/operator-auth/index.mjs'
import { configuredOwnerName } from './owner-name.server'
import { baseAuthConfig } from './base-auth.server'
import type { PlatformBindings } from './bindings'

/** The optional pull-link door shares Base's accounts and admission with email. */
export function isDependencyRequest(path: string): boolean {
  return path === '/.well-known/rer-dependencies' || path === '/.well-known/rer-link/callback'
    || path === '/.well-known/rer-link/jwks' || path.startsWith('/.well-known/rer-link/jwks/')
    || path.startsWith('/auth/dependencies/')
}

export async function dependencyResponse(request: Request, env: PlatformBindings, auth: OperatorAuth): Promise<Response | null> {
  if (!isDependencyRequest(new URL(request.url).pathname)) return null
  const config = baseAuthConfig(env)
  let provider = env.IDENTITY_PROVIDER?.trim() || undefined
  // Validate this optional answer at its own door; email recovery remains available.
  if (provider) {
    try {
      const url = new URL(provider)
      if ((provider !== url.origin && provider !== url.origin + '/') || url.protocol !== 'https:' || url.username || url.password) throw new Error()
      provider = url.origin
    } catch {
      return Response.json({ error: 'invalid_identity_provider' }, { status: 503, headers: securityHeaders() })
    }
  }
  const claim = createIdpOwnerClaimHandler({ db: env.DB, authConfig: config, clientIp: (request: Request) => request.headers.get('CF-Connecting-IP') ?? '' })
  return createDependencies({ db: env.DB, origin: config.origin, name: 'Cradle', provider, local: config.local, auth,
    claimOwner: token => claim(new Request(config.origin + '/auth/owner-claim', { method: 'POST',
      headers: { Host: new URL(config.origin).host, Origin: config.origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': request.headers.get('CF-Connecting-IP') ?? '' },
      body: JSON.stringify({ token, displayName: configuredOwnerName(env) }),
    })),
  }).handle(request)
}
