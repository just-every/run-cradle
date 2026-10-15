import { createOperatorAuth, createAuthHandler } from '../../../vendor/base/modules/operator-auth/index.mjs'
import { createMailSender } from '../../../vendor/base/modules/mail/index.mjs'
import { createD1DevelopmentOutbox } from '../../../vendor/base/modules/mail/src/development/index.mjs'
import { localMailEnabled, capturedMailEnabled } from './local-auth.server'
import type { PlatformBindings } from './bindings'
import type { AuthConfig, OperatorAuth } from '../../../vendor/base/modules/operator-auth/index.mjs'
import { ApiError } from '../registry/errors'

/** The AuthConfig Base's operator-auth and the local dev layer both read. */
export function baseAuthConfig(env: PlatformBindings): AuthConfig {
  if (!env.OWNER_EMAIL?.trim()) throw new ApiError('unconfigured', 'OWNER_EMAIL is required for Base operator authentication.')
  return {
    local: localMailEnabled(env), branding: { productName: 'Cradle', signInPath: '/signin', theme: '/rer-theme.css' },
    origin: env.APP_ORIGIN ?? '', OWNER_EMAIL: env.OWNER_EMAIL,
    SESSION_SECRET: env.SESSION_SECRET ?? '', SETUP_TOKEN: env.SETUP_TOKEN,
    MAIL_FROM: env.MAIL_FROM, dependencies: true,
  }
}

/** Base owns credentials, bootstrap, mail and session admission. */
export function createBaseAuth(env: PlatformBindings): OperatorAuth {
  const config = baseAuthConfig(env)
  if (env.MAIL_PROVIDER === 'development' && !capturedMailEnabled(env)) throw new ApiError('unconfigured', 'Development mail requires explicit local configuration.')
  const mailSender = env.MAIL_PROVIDER === 'development' && env.RER_DEMO === '1'
    ? createMailSender({ provider: 'development', mode: 'development' }, { outbox: createD1DevelopmentOutbox({ db: env.DB }) })
    : env.MAIL_PROVIDER && env.MAIL_PROVIDER !== 'development' && env.MAIL_PROVIDER_API_KEY
    ? createMailSender({ provider: env.MAIL_PROVIDER, mode: 'production', apiKey: env.MAIL_PROVIDER_API_KEY }) : undefined
  return createOperatorAuth({ db: env.DB, config, mailSender, clientIp: request => request.headers.get('CF-Connecting-IP') ?? '' })
}
export { createAuthHandler }
