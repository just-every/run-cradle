import type { PlatformBindings } from '../core/platform/bindings'

/** Local demos may inherit saved settings; none of their outbound credentials apply. */
export function demoBindings(env: PlatformBindings): PlatformBindings {
  if (env.RER_DEMO !== '1') return env
  return { ...env, MAIL_PROVIDER: 'development', MAIL_FROM: 'Cradle demo <demo@demo.invalid>',
    MAIL_PROVIDER_API_KEY: undefined, MAIL_API_KEY: undefined, MAIL_RELAY_URL: undefined,
    AI_PROVIDER_API_KEY: undefined, AI_MODEL: undefined,
    GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined,
    XERO_CLIENT_ID: undefined, XERO_CLIENT_SECRET: undefined,
    EGRESS_RELAY_URL: undefined, EGRESS_RELAY_SECRET: undefined,
    CANDIDATE_RUNNER_URL: undefined, CANDIDATE_RUNNER_TOKEN: undefined,
    CANDIDATE_DEPLOY_TOKEN: undefined, CANDIDATE_RUNNER_PUBLIC_KEY: undefined,
  }
}
