import { createOperatorAuth, createAuthHandler } from '../../../vendor/base/modules/operator-auth/index.mjs'
import { createMailSender } from '../../../vendor/base/modules/mail/index.mjs'
import { localMailEnabled, capturedMailEnabled } from './local-auth.server'
import type { PlatformBindings } from './bindings'
import type { AuthConfig, OperatorAuth } from '../../../vendor/base/modules/operator-auth/index.mjs'
import {hostedMailConfig,hostedMailConfigured} from './hosted-mail.server'
import { ApiError } from '../registry/errors'

/** The AuthConfig Base's operator-auth and the local dev layer both read. */
export function baseAuthConfig(env: PlatformBindings): AuthConfig {
  if (!env.OWNER_EMAIL?.trim()) throw new ApiError('unconfigured', 'OWNER_EMAIL is required for Base operator authentication.')
  return {
    local: localMailEnabled(env), branding: { productName: 'Cradle', signInPath: '/signin', theme: '/rer-theme.css' },
    origin: env.APP_ORIGIN ?? '', OWNER_EMAIL: env.OWNER_EMAIL,
    SESSION_SECRET: env.SESSION_SECRET ?? '', SETUP_TOKEN: env.SETUP_TOKEN,
    INSTALLATION_KEY: env.INSTALLATION_KEY, INSTALLATION_KEY_PREVIOUS: env.INSTALLATION_KEY_PREVIOUS,
    MAIL_FROM: env.MAIL_FROM, dependencies: true,
  }
}

/** Base owns credentials, bootstrap, mail and session admission. */
export function createBaseAuth(env: PlatformBindings): OperatorAuth {
  const config = baseAuthConfig(env)
  if (env.MAIL_PROVIDER === 'development' && !capturedMailEnabled(env)) throw new ApiError('unconfigured', 'Development mail requires explicit local configuration.')
  const mailSender = env.MAIL_PROVIDER === 'development' && env.RER_DEMO === '1'
    ? createMailSender({ provider: 'development', mode: 'development' })
    : hostedMailConfigured(env) ? createMailSender(hostedMailConfig(env)!) : undefined
  return createOperatorAuth({ db: env.DB, config, mailSender, clientIp: request => request.headers.get('CF-Connecting-IP') ?? '', hooks: {
    async afterConfirm({request,operator,session,method}) {
      const kind=new URL(request.url).pathname==='/auth/saml/acs'?'saml':method
      // Failure refuses and revokes the newly issued session through Base's
      // completion hook; never acknowledge a sign-in without its audit row.
      if(kind==='saml') {
        await env.DB.prepare('INSERT INTO company_identity_audit(id,actor_id,operator_id,action,created_at) VALUES(?,?,?,?,?)')
          .bind('signin:'+session.id,operator.id,operator.id,'signin.saml',Date.now()).run()
      } else {
        await env.DB.prepare('INSERT INTO oa_auth_audit(id,actor_id,action,value,created_at) VALUES(?,?,?,?,?)')
          .bind('signin:'+session.id,operator.id,'signin.'+kind,'',Date.now()).run()
      }
    },
  } })
}
export { createAuthHandler }
