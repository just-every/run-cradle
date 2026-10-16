import assert from 'node:assert/strict'
import {createPortability} from '@runeditrun/rer/modules/portability'
import {portabilityPolicy} from '../../scripts/portability/policy.mjs'
import {derivedSearch} from '../../scripts/portability/records.mjs'

/** Exercise the maintained archive with populated credentials and protocol state.
 * Assert excluded values and dormant restoration, not a pinned table inventory. */
export async function verifyIdentityArchive(h,{issuer,subject,connection,mapping}){
 const key='fixture-only-private-dependency-key',code='fixture-only-consumed-dependency-code',transaction='fixture-only-encrypted-oidc-transaction'
 h.sql.prepare('INSERT INTO rer_dependency_keys(interface,private_key) VALUES(?,?)').run('oidc-provider@1',key)
 h.sql.prepare('INSERT INTO rer_dependency_codes(digest,created_at) VALUES(?,?)').run(code,Date.now())
 h.sql.prepare('INSERT INTO oa_oidc_transactions(state_hash,binding_hash,config_hash,payload,expires_at) VALUES(?,?,?,?,?)').run('fixture-state','fixture-binding','fixture-config',transaction,Date.now()+600000)
 h.sql.prepare('INSERT INTO rer_dependency_link(interface,issuer,client_id,metadata,needs_relink,linked_at) VALUES(?,?,?,?,0,?)').run('oidc-provider@1',issuer,'cradle-client','{}',Date.now())
 const api=await createPortability({db:h.db,buckets:{FILES:h.bucket},policy:{...portabilityPolicy,derivedTables:await derivedSearch(h.db)}}),id=await api.exports.create('identity-privacy-proof')
 try{
  while((await api.exports.status(id)).phase!=='complete')await api.exports.advance(id,{maxParts:100})
  const content=await new Response(await api.exports.download(id)).text()
  for(const secret of [key,code,transaction,subject,'member-provider-session','member-approval','used-member-grant'])assert.ok(!content.includes(secret),'Private identity and protocol custody must not leave in an installation archive: '+secret)
  const archive=content.trim().split('\n').map(JSON.parse),rows=archive.flatMap(part=>part.items??[])
  const link=rows.find(item=>item.table==='rer_dependency_link').row
  assert.equal(link.needs_relink,1,'Imported provider metadata must require a fresh owner link')
  assert.equal(h.sql.prepare("SELECT needs_relink FROM rer_dependency_link WHERE interface='oidc-provider@1'").get().needs_relink,0,'Export does not unlink the live provider')
  const retained=rows.find(item=>item.table==='repair_accounting_mappings'&&item.row.connection_id===connection).row
  assert.equal(retained.version,3);assert.deepEqual(JSON.parse(retained.mapping_json),mapping,'The exact accountant mapping is portable without connection credentials')
 }finally{await api.exports.abort(id)}
 // No member relation exists for the encrypted pre-login transaction.
 assert.equal(h.sql.prepare('SELECT payload FROM oa_oidc_transactions WHERE state_hash=?').get('fixture-state').payload,transaction)
}
