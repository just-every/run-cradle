import type { PlatformBindings } from './core/platform/bindings'
import type { RequestContext } from './domains/authority/ports'
import { createPlatform } from './core/platform'
import { currentComposition } from './core/app/application-cache.server'
import { createUlid } from './core/shared/ids'
import { sampleData } from './core/features/sample-data/data'
import { seedActivity } from './demo/activity.server'
import { seedMembers } from './demo/members.server'

/** Run the installed samples command under the admitted owner's current session. */
export async function seedDemo(env: PlatformBindings, { ownerEmail, now }: { ownerEmail: string; now: Date }) {
  const db = env.DB, platform = createPlatform(env)
  const owner = await db.prepare(`SELECT o.id AS baseId,p.id,p.authentication_epoch AS epoch,s.id AS sessionId,s.created_at,s.expires_at
    FROM oa_operators o JOIN cradle_base_operators m ON m.base_id=o.id JOIN authority_principals p ON p.id=m.principal_id
    JOIN oa_sessions s ON s.operator_id=o.id WHERE o.email=? AND o.role='owner' AND o.status='active'
    AND s.revoked_at IS NULL AND s.expires_at>? ORDER BY s.created_at DESC LIMIT 1`).bind(ownerEmail, now.getTime())
    .first<{baseId:string;id:string;epoch:number;sessionId:string;created_at:number;expires_at:number}>()
  if (!owner) throw new Error('Demo samples require the admitted owner session')
  await platform.auth.configuration.initializeBaseOwner!(owner.baseId)
  const sessionId = createUlid()
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO authority_sessions(id,principal_id,token_hash,csrf_hash,authentication_epoch,created_at,last_seen_at,expires_at)
      SELECT ?,?,?,'',?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM cradle_base_sessions WHERE base_id=?)`)
      .bind(sessionId,owner.id,`base:${owner.sessionId}`,owner.epoch,owner.created_at,now.getTime(),owner.expires_at,owner.sessionId),
    db.prepare('INSERT OR IGNORE INTO cradle_base_sessions(base_id,session_id) SELECT ?,? WHERE EXISTS(SELECT 1 FROM authority_sessions WHERE id=?)').bind(owner.sessionId,sessionId,sessionId),
  ])
  const current = await db.prepare('SELECT session_id FROM cradle_base_sessions WHERE base_id=?').bind(owner.sessionId).first<{session_id:string}>()
  const ctx: RequestContext = { principal: { id:owner.id,kind:'human',humanId:owner.id,sessionId:current!.session_id,baseSessionId:owner.sessionId,
    credentialId:null,issuedAt:new Date(owner.created_at).toISOString(),expiresAt:new Date(owner.expires_at).toISOString(),authenticationEpoch:owner.epoch },
    requestId:'00000000000000000000000DEM',now:now.toISOString(),ingress:'http' }
  const { foundation } = (await currentComposition(env)).runtime
  if (!await db.prepare('SELECT 1 FROM sample_installations LIMIT 1').first()) {
    const receipt = await foundation.commands.get('launch.samples.install')!.execute(ctx,{commandId:'00000000000000000000000DEM',expected:[],input:{}})
    if (receipt.result.state !== 'committed') throw new Error('Demo sample installation did not commit')
  }
  await seedMembers(db, now, owner.id)
  await seedActivity(db, foundation, ctx)
  await db.batch([
    db.prepare("UPDATE workspace SET name=?,timezone=?,currency=? WHERE id='workspace'").bind(sampleData.workspace.name,sampleData.workspace.timezone,sampleData.workspace.currency),
    db.prepare('UPDATE workspace_settings SET workspace_name=?,timezone=?,currency=?,ai_enabled=1').bind(sampleData.workspace.name,sampleData.workspace.timezone,sampleData.workspace.currency),
    db.prepare('UPDATE cradle_first_run SET completed_at=? WHERE singleton=1').bind(now.getTime()),
  ])
}
