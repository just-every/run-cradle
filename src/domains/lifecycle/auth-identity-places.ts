import type {IdentityPlace} from './member-identity-places'

const base='IN (SELECT base_id FROM cradle_base_operators WHERE principal_id=?)'
const sessions=`IN (SELECT id FROM oa_sessions WHERE operator_id ${base})`
const remove=(table:string,where:string,reason:string):IdentityPlace=>({table,where,values:person=>Array.from(where.matchAll(/\?/g),()=>person.id),action:'delete',reason})

/** Base IDs differ from product principals. Keep replay-ledger keys, but remove
 * the attributable subject before its external-identity join is deleted. */
export const authIdentityPlaces:IdentityPlace[]=[
 remove('company_scim_credentials',`owner_id ${base}`,'their issued SCIM credentials'),
 remove('company_scim_users',`operator_id ${base}`,'their SCIM identity and names'),
 {table:'company_identity_audit',where:`operator_id ${base}`,values:person=>[person.id],action:'set',columns:['operator_id'],set:()=>({operator_id:null}),reason:'anonymous subject in retained company identity audit'},
 {table:'company_identity_audit',where:`actor_id ${base}`,values:person=>[person.id],action:'set',columns:['actor_id'],set:()=>({actor_id:''}),reason:'anonymous actor in retained company identity audit'},
 {table:'oa_auth_audit',where:`actor_id ${base}`,values:person=>[person.id],action:'set',columns:['value'],set:()=>({value:''}),reason:'retired identity-bearing authentication audit metadata'},
 {table:'oa_auth_audit',where:`actor_id ${base}`,values:person=>[person.id],action:'set',columns:['actor_id'],set:()=>({actor_id:''}),reason:'anonymous actor in retained authentication audit'},
 remove('rer_dependency_pending',`approved_by ${base}`,'their pending dependency approvals'),
 remove('oa_setup_links',`owner_id ${base} OR session_id ${sessions}`,'their provider setup attempts'),
 remove('oa_provider_session_pins',`session_id ${sessions}`,'their provider session pins'),
 remove('oa_provider_sessions',`session_id ${sessions}`,'their provider session identities'),
 {table:'oc_idp_grants',where:`EXISTS(SELECT 1 FROM oa_external_identities e WHERE e.issuer=oc_idp_grants.issuer AND e.subject=oc_idp_grants.subject AND e.operator_id ${base})`,values:person=>[person.id],action:'set',columns:['subject'],set:()=>({subject:''}),reason:'their subject in consumed owner grants; replay keys remain'},
 remove('oa_external_identities',`operator_id ${base}`,'their external sign-in identities'),
]
