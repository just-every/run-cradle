import { env } from 'cloudflare:workers'
import {hostedMailConfigured} from '../platform/hosted-mail.server'
import { createBaseAuth } from '../platform/base-auth.server'

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
    ownerClaimed: !!await env.DB.prepare('SELECT singleton FROM oa_bootstrap WHERE singleton=1').first(),
    ...(identity ? { identityProviders: (await createBaseAuth(env).providers?.list() ?? []).filter(provider => provider.visible).map(({ label, startPath }) => ({ label, startPath })) } : {}),
    magicLink: hostedMailConfigured(env),
  }
}
export type PublicDocument = Awaited<ReturnType<typeof publicDocument>>
