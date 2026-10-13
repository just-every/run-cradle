import type { Principal, RequestContext } from './ports'
import { trustedPredicate } from '../admission/sql.server'
import { AuthorityError, denied } from './errors'

/** A proposing key has its own audience: one door with a REST face and an MCP face. */
export const proposalAudience=(origin:string)=>`${origin}/agent-proposals`
/** The only paths a proposing key may reach; every other path answers as missing. */
export const isProposalDoor=(path:string)=>path==='/mcp'||path==='/api/v1/proposals'||path.startsWith('/api/v1/proposals/')||path==='/api/v1/commands/schema.propose'||path==='/api/v1/commands/schema.withdraw'

/** Answer a refused proposing-key request as a missing route, after reading (at most 1 MiB of) its
 * body so the connection stays reusable; an unread body makes workerd reset the client's next request. */
export async function refuseOutsideDoor(request:Request):Promise<never> {
 const reader=request.body?.getReader()
 for(let bytes=0;reader&&bytes<=1048576;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength}
 await reader?.cancel()
 throw new AuthorityError('not_found','No API route matches this path.',404)
}

/** The binding, its issuing installation owner and that owner's Base role stay current. */
export function proposerGuard(principalId:string) {
 return trustedPredicate(`EXISTS(SELECT 1 FROM authority_schema_proposers b
  JOIN authority_principals issuer ON issuer.id=b.issuer_id
  JOIN operators legacy ON legacy.id=issuer.human_id
  JOIN cradle_base_operators projection ON projection.principal_id=issuer.id AND projection.base_id=b.base_operator_id
  JOIN oa_operators o ON o.id=projection.base_id
  WHERE b.principal_id=? AND b.revoked_at IS NULL AND issuer.state='active' AND issuer.initial_owner=1
   AND issuer.authentication_epoch=b.issuer_epoch AND legacy.active=1
   AND o.status='active' AND o.role='owner' AND o.version=b.base_operator_version)`,[principalId])
}

/** Authentication of an issuer view: the proposing principal, its credential and its binding. */
export function proposerAuthentication(via:NonNullable<Principal['viaProposer']>,now:number) {
 return [
  trustedPredicate(`EXISTS(SELECT 1 FROM authority_principals WHERE id=? AND kind='connector' AND state='active' AND authentication_epoch=?)`,[via.principalId,via.authenticationEpoch]),
  trustedPredicate(`EXISTS(SELECT 1 FROM authority_credentials WHERE id=? AND principal_id=? AND authentication_epoch=? AND revoked_at IS NULL AND expires_at>MAX(?,unixepoch('subsec')*1000))`,[via.credentialId,via.principalId,via.authenticationEpoch,now]),
  proposerGuard(via.principalId),
 ]
}

/** Only a credential issued for the proposal audience is a proposing key. */
export async function bindProposer(db:D1Database,principal:Principal,proposalAudienceMatched:boolean):Promise<Principal> {
 if(!proposalAudienceMatched)return principal
 const bound=await db.prepare('SELECT app_id,issuer_id FROM authority_schema_proposers WHERE principal_id=?').bind(principal.id).first<{app_id:string;issuer_id:string}>()
 if(!bound)throw new AuthorityError('signed_out','The machine credential is invalid or expired.',401)
 const guard=proposerGuard(principal.id)
 if(!await db.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.values).first())
  throw new AuthorityError('grant_revoked','The issuer changed or revoked this proposing key.')
 return {...principal,proposer:{appId:bound.app_id,issuerId:bound.issuer_id}}
}

/** Read-only view as the issuing owner, authenticated by the proposing key. It can read
 * schema under the owner's current policy and is refused every authorization. */
export async function issuerView(db:D1Database,ctx:RequestContext):Promise<RequestContext> {
 const p=ctx.principal
 if(!p.proposer||!p.credentialId)return denied()
 const issuer=await db.prepare('SELECT b.issuer_epoch,i.human_id FROM authority_schema_proposers b JOIN authority_principals i ON i.id=b.issuer_id WHERE b.principal_id=? AND b.issuer_id=?').bind(p.id,p.proposer.issuerId).first<{issuer_epoch:number;human_id:string|null}>()
 if(!issuer)return denied()
 return {...ctx,principal:{id:p.proposer.issuerId,kind:'human',humanId:issuer.human_id,sessionId:null,credentialId:null,issuedAt:p.issuedAt,expiresAt:p.expiresAt,authenticationEpoch:issuer.issuer_epoch,
  viaProposer:{principalId:p.id,credentialId:p.credentialId,authenticationEpoch:p.authenticationEpoch}}}
}
