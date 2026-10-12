import type { OperatorAuth } from '../../../vendor/base/modules/operator-auth/index.mjs'
import type { AuthConfiguration, Principal } from './ports'
import { createUlid } from '../../core/shared/ids'
import { digest, signToken } from './crypto.server'
import { AuthorityError } from './errors'

/** A product projection; it cannot issue or accept any credential. */
export function createBaseSessionReader(db: D1Database, config: AuthConfiguration, base: OperatorAuth) {
  return async (request: Request) => {
    const session = await base.getSession(request)
    if (!session) return undefined
    const operator = await db.prepare(`SELECT p.id,p.authentication_epoch,p.initial_owner FROM cradle_base_operators m
      JOIN authority_principals p ON p.id=m.principal_id JOIN operators o ON o.id=p.human_id
      WHERE m.base_id=? AND p.state='active' AND o.active=1`).bind(session.operatorId)
      .first<{id:string;authentication_epoch:number;initial_owner:number}>()
    if (!operator) return undefined
    if (operator.initial_owner) {
      if (!config.initializeBaseOwner) throw new AuthorityError('unconfigured','INSTALLATION coordinator is required.',503)
      await config.initializeBaseOwner(session.operatorId)
    }
    // The mirrored session is a policy handle. Its token cannot sign anyone in.
    const id=createUlid(),now=Date.now()
    await db.batch([
      db.prepare(`INSERT OR IGNORE INTO authority_sessions(id,principal_id,token_hash,csrf_hash,authentication_epoch,created_at,last_seen_at,expires_at)
        SELECT ?,?,?,'',?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM cradle_base_sessions WHERE base_id=?)`)
        .bind(id,operator.id,`base:${session.id}`,operator.authentication_epoch,session.createdAt,now,session.expiresAt,session.id),
      db.prepare(`INSERT OR IGNORE INTO cradle_base_sessions(base_id,session_id) SELECT ?,? WHERE EXISTS(SELECT 1 FROM authority_sessions WHERE id=?)`).bind(session.id,id,id),
    ])
    const row=await db.prepare(`SELECT s.id,s.csrf_hash FROM cradle_base_sessions m JOIN authority_sessions s ON s.id=m.session_id
      WHERE m.base_id=? AND s.principal_id=? AND s.revoked_at IS NULL AND s.authentication_epoch=?`).bind(session.id,operator.id,operator.authentication_epoch)
      .first<{id:string;csrf_hash:string}>()
    if (!row) return undefined
    await db.prepare('UPDATE authority_sessions SET last_seen_at=? WHERE id=?').bind(now,row.id).run()
    const principal: Principal={id:operator.id,kind:'human',humanId:operator.id,sessionId:row.id,baseSessionId:session.id,credentialId:null,
      issuedAt:new Date(session.createdAt).toISOString(),expiresAt:new Date(session.expiresAt).toISOString(),authenticationEpoch:operator.authentication_epoch}
    return {principal,csrfHash:row.csrf_hash}
  }
}

export function createBaseProductAuth(db: D1Database, config: AuthConfiguration, base: OperatorAuth) {
  const current=createBaseSessionReader(db,config,base)
  const csrf=async(request:Request)=>{
    const s=await current(request);if(!s)throw new AuthorityError('signed_out','Sign in to continue.',401)
    const value=await signToken({purpose:'session-csrf',sessionId:s.principal.sessionId},config.sessionSecret)
    await db.prepare('UPDATE authority_sessions SET csrf_hash=? WHERE id=?').bind(await digest(value),s.principal.sessionId).run()
    return value
  }
  const requireCsrf=async(request:Request)=>{
    if(new URL(request.url).origin!==config.appOrigin||request.headers.get('origin')!==config.appOrigin||request.headers.get('sec-fetch-site')==='cross-site')throw new AuthorityError('forbidden','A same-origin request is required.')
    const s=await current(request);if(!s)throw new AuthorityError('signed_out','Sign in to continue.',401)
    if(!request.headers.get('x-csrf-token')||await digest(request.headers.get('x-csrf-token')!)!==s.csrfHash)throw new AuthorityError('forbidden','A current CSRF token is required.')
    return s
  }
  const rate=async(key:string,limit:number,window:number)=>{
    const start=Math.floor(Date.now()/window)*window
    const row=await db.prepare(`INSERT INTO authority_rate_limits(key_hash,window_start,count) VALUES(?,?,1) ON CONFLICT(key_hash) DO UPDATE SET window_start=excluded.window_start,count=CASE WHEN window_start=excluded.window_start THEN count+1 ELSE 1 END RETURNING count`).bind(await digest(key),start).first<{count:number}>()
    if(!row||row.count>limit)throw new AuthorityError('rate_limited','Too many requests.',429)
  }
  return {current,csrf,requireCsrf,rate,
    capabilities:{localDevelopmentSignIn:false,magicLink:{status:config.baseMailConfigured?'configured':'unconfigured'}},
    requestLink:(request:Request,input:{email:string;returnTo:string})=>base.requestMagicLink(request,input),
    signOut:async(request:Request)=>{await requireCsrf(request);return await base.signOut(request)},
    sessions:async(request:Request)=>{await current(request);const s=await base.getSession(request);if(!s)throw new AuthorityError('signed_out','Sign in to continue.',401);return(await base.listSessions(request,s.operatorId)).map(row=>({...row,current:row.id===s.id}))},
    revokeSession:async(request:Request,id:string)=>{await requireCsrf(request);await base.revokeSession(request,id)},
  }
}
