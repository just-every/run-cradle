import {createHash,randomBytes,randomUUID} from 'node:crypto'
/** A retained pre-Base session row, deliberately unacceptable to the new router. */
export async function legacyCookieFixture(db,principal){
 const token=randomBytes(32).toString('base64url'),now=Date.now()
 await db.prepare('INSERT INTO authority_sessions(id,principal_id,token_hash,csrf_hash,authentication_epoch,created_at,last_seen_at,expires_at) VALUES(?,?,?,?,1,?,?,?)').bind(randomUUID(),principal,createHash('sha256').update(token).digest('hex'),'',now,now,now+3600000).run()
 return 'session_id='+token
}
