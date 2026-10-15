import { localMailEnabled, localRuntimeBindings } from './local-auth.server'
import { createBaseAuth } from './base-auth.server'
import { devGate } from '../../../vendor/base/modules/operator-auth/index.mjs'
import type { AuthConfiguration } from '../../domains/authority/ports'
import { checkHealth } from './health'
import { redirectToSignIn } from './auth'
import type { PlatformBindings } from './bindings'
import { checkDatabase, createDatabase } from './database'

export const createPlatform = (input: PlatformBindings) => {
 const bindings = localRuntimeBindings(input)
 return ({
  auth: {
    configuration: {
      appOrigin: bindings.APP_ORIGIN ?? '',
      sessionSecret: bindings.SESSION_SECRET ?? '',
      mode: localMailEnabled(bindings) ? 'development' : 'production',
      base: createBaseAuth(bindings),
      initializeBaseOwner: async (operatorId: string) => {
        if (!bindings.INSTALLATION) throw new Error('INSTALLATION Durable Object binding is required.')
        const response = await bindings.INSTALLATION.get(bindings.INSTALLATION.idFromName('workspace')).fetch('https://installation/initialize', { method: 'POST', body: JSON.stringify({ operatorId }) })
        if (!response.ok) throw new Error('First-owner product initialization failed.')
      },
      // Credentials minted in a dev session count only on a request holding this checkout's key.
      devCredentialGate: async (request: Request) => await devGate({ key: bindings.RER_DEV_KEY, origin: bindings.APP_ORIGIN ?? '', local: localMailEnabled(bindings) })?.admits(request) ?? false,
      baseMailConfigured: !!(bindings.MAIL_FROM && ((bindings.RER_DEMO === '1' && bindings.MAIL_PROVIDER === 'development') || (bindings.MAIL_PROVIDER && bindings.MAIL_PROVIDER !== 'development' && bindings.MAIL_PROVIDER_API_KEY))),
    } as AuthConfiguration,
    redirectToSignIn,
  },
  assets: {
    fetch: (request: Request) => bindings.ASSETS.fetch(request),
  },
  bindings,
  database: createDatabase(bindings.DB),
  health: {
    check: () => checkHealth(bindings),
    checkDatabase: () => checkDatabase(bindings.DB),
  },
})
}

export type Platform = ReturnType<typeof createPlatform>
