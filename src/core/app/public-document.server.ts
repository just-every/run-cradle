import { env } from 'cloudflare:workers'
import { localMailEnabled } from '../platform/local-auth.server'

/** Only the identity plate name and sign-in capabilities are public. */
export async function publicDocument() {
  let workspaceName: string | null = null
  try {
    const workspace = await env.DB.prepare("SELECT name FROM workspace WHERE id='workspace'").first<{name:string}>()
    workspaceName = workspace?.name ?? null
  } catch {
    // Public screens already select their configured identity when this name is unavailable.
    // Keep capability checks and authenticated document failures outside this read.
  }
  return {
    workspaceName,
    developmentOutbox: localMailEnabled(env) && env.MAIL_PROVIDER === 'development',
    magicLink: !!(env.MAIL_FROM && ((localMailEnabled(env) && env.MAIL_PROVIDER === 'development') || (env.MAIL_PROVIDER && env.MAIL_PROVIDER_API_KEY))),
  }
}
export type PublicDocument = Awaited<ReturnType<typeof publicDocument>>
