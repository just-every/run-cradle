import {configuration} from '../../domains/company-identity/saml.server'
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
  const saml=identity?await configuration(env.DB):null
  const samlVisible=saml?.enabled&&await createBaseAuth(env).accounts.identityEnabled?.()
  return {
    workspaceName,
    ownerClaimed: !!await env.DB.prepare('SELECT singleton FROM oa_bootstrap WHERE singleton=1').first(),
    ...(identity ? { identityProviders: [...(await createBaseAuth(env).providers?.list() ?? []).filter(provider => provider.visible).map(({ label, startPath }) => ({ label, startPath })),...(samlVisible?[{label:'company (SAML)',startPath:'/auth/saml/start'}]:[])] } : {}),
    magicLink: hostedMailConfigured(env),
  }
}
export type PublicDocument = Awaited<ReturnType<typeof publicDocument>>
