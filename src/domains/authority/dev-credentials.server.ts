import { registerTable } from '../admission/sql.server'
import type { RequestContext } from './ports'

/**
 * A credential minted while signed in with a Base dev session is recorded in
 * operator-auth's oa_dev_credentials, in the same commit that creates it, and then
 * counts only on a request that passes the local key gate. A deployed Worker has no
 * key, so it refuses every such credential. A credential minted in an ordinary
 * session is never recorded and is unchanged.
 */
export const DEV_CREDENTIAL_KIND = 'authority_credentials'
export const devCredentials = registerTable('oa_dev_credentials', ['credential', 'id', 'created_at'])

export async function mintedInDevSession(db: D1Database, ctx: RequestContext): Promise<boolean> {
  if (!ctx.principal.baseSessionId) return false
  return Boolean(await db.prepare("SELECT 1 FROM oa_sessions WHERE id=? AND kind='dev'").bind(ctx.principal.baseSessionId).first())
}

export async function isDevMinted(db: D1Database, credentialId: string): Promise<boolean> {
  return Boolean(await db.prepare('SELECT 1 FROM oa_dev_credentials WHERE credential=? AND id=?').bind(DEV_CREDENTIAL_KIND, credentialId).first())
}
