import { env } from 'cloudflare:workers'
import { createBaseAuth } from '../platform/base-auth.server'
import { localMailEnabled } from '../platform/local-auth.server'

/** Only the identity plate name and sign-in capabilities are public. */
export async function publicDocument({ identity = false }: { identity?: boolean } = {}) {
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
    ...(identity ? { identityProviders: (await createBaseAuth(env).providers?.list() ?? []).filter(provider => provider.visible && provider.linked).map(({ label, startPath }) => ({ label, startPath })) } : {}),
    developmentOutbox: localMailEnabled(env) && env.MAIL_PROVIDER === 'development',
    magicLink: !!(env.MAIL_FROM && ((localMailEnabled(env) && env.MAIL_PROVIDER === 'development') || (env.MAIL_PROVIDER && env.MAIL_PROVIDER_API_KEY))),
  }
}
export type PublicDocument = Awaited<ReturnType<typeof publicDocument>>
