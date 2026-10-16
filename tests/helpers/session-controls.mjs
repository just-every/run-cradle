import {createHmac} from 'node:crypto'
export const expiredToken='migrationexpired'.padEnd(43,'x')
export const revokedToken='synthetic-migrationrevoked'.padEnd(43,'x')
/** Persist real Base expired/revoked credentials; neither control is an unknown cookie. */
export function authoritySessionControlsSql(operator,now,secret='test-only-session-secret-32-characters-long'){
 if(!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(operator))throw new Error('Invalid fixture principal')
 const digest=token=>createHmac('sha256',secret).update('session\0'+token).digest('hex')
 const base=`(SELECT base_id FROM cradle_base_operators WHERE principal_id='${operator}')`
 const version=`(SELECT version FROM oa_operators WHERE id=${base})`
 const value=(id,token,expiry,revoked)=>`('${id}','${digest(token)}',${base},${version},'native',${now},${expiry},${revoked})`
 return `INSERT INTO oa_sessions(id,token_hash,operator_id,operator_version,kind,created_at,expires_at,revoked_at) VALUES ${value('test-expired',expiredToken,now-1,'NULL')},${value('test-revoked',revokedToken,now+86400000,now)}`
}
