import {identifier,registerTable,trustedPredicate} from '../admission/sql.server'
import type {SqlScalar} from '../admission/ports'
import {AuthorityError} from '../authority/errors'
import {removeRows,updateRows,type Effects} from './changes.server'
import {replacementOrder,scrubWholeTokens} from './identity-match'
import {personIdentityColumns,type IdentityPerson,type IdentityPlace} from './member-identity-places'
type Column={name:string;type:string;pk:number;hidden:number}
export type IdentityCopyReason='inside_longer_word'|'other_person'|'not_attributed'
export type IdentityCopy={store:string;rows:number;reason:IdentityCopyReason}
export type PlannedPlace={store:string;action:IdentityPlace['action'];rows:number;reason:string}
type Sql={sql:string;values:SqlScalar[]}
const custody=/^(ik_|record_import_|rer_portability_|e_snap_|e_stage_|construction_|operation_cases$|operation_case_history$|evidence_source_versions$|app_releases$|release_recovery_plans$)/
const isProtected=(c:Column)=>c.pk>0||/(^id$|_id$|_hash$|sha256|signature|token)/.test(c.name)
const escaped=(value:string)=>JSON.stringify(value).slice(1,-1)
/** Code-point form of identity-match.ts word characters (D1 caps GLOB pattern length). */
const word=(x:string)=>`(${x} BETWEEN 48 AND 57 OR ${x} BETWEEN 65 AND 90 OR ${x}=95 OR ${x} BETWEEN 97 AND 122 OR (${x}>=192 AND NOT ${x} BETWEEN 8192 AND 8303))`
const char=(offset:string)=>`CASE WHEN ${offset}>=1 THEN substr(v,${offset},1) ELSE '' END`
/** True when any occurrence of a literal sits inside a longer token. Each literal is checked
 * after longer literals are blanked, so a name inside its own email is not a longer word.
 * Bindings follow textual order: nested replace() literals bind innermost first.
 */
function longerToken(text:string,matches:string[]):Sql{
 let current=text;const sql:string[]=[],values:SqlScalar[]=[],blanked:string[]=[]
 for(const literal of matches){
  const n=[...literal].length
  sql.push(`EXISTS(WITH RECURSIVE s(v) AS (SELECT ${current}),o(p) AS (SELECT instr(v,?) FROM s UNION ALL SELECT p+instr(substr(v,p+1),?) FROM o,s WHERE instr(substr(v,p+1),?)>0) SELECT 1 FROM (SELECT unicode(${char('p-1')}) b1,${char('p-1')} j1,unicode(${char('p-2')}) b2,unicode(${char(`p+${n}`)}) a1,${char(`p+${n}`)} j2,unicode(${char(`p+${n+1}`)}) a2 FROM o,s WHERE p>0) WHERE coalesce(${word('b1')},0) OR (j1 IN ('.','+','@','-') AND coalesce(${word('b2')},0)) OR coalesce(${word('a1')},0) OR (j2 IN ('.','+','@','-') AND coalesce(${word('a2')},0)))`)
  values.push(...blanked,literal,literal,literal)
  current=`replace(${current},?,' ')`;blanked.push(literal)
 }
 return {sql:sql.join(' OR '),values}
}
const any=(items:Sql[]):Sql=>items.length?{sql:items.map(i=>`coalesce((${i.sql}),0)`).join(' OR '),values:items.flatMap(i=>i.values)}:{sql:'0',values:[]}
/** Splits every literal copy of the identity into planned places and copies that must stay
 * untouched. Clean whole-token copies in attributed rows get one counted set-oriented
 * replacement per column; rows that also hold a longer word or another person's name are
 * rewritten per row only after the owner confirms that store, and only at whole tokens.
 */
export async function redactIdentityCopies(db:D1Database,change:Effects,input:{person:IdentityPerson;needles:string[];label:string;places:IdentityPlace[];others:string[];keep:ReadonlySet<string>}){
 const {needles,label,others}=input,matches=replacementOrder(needles.flatMap(needle=>[needle,escaped(needle)])),residual:IdentityCopy[]=[],planned:PlannedPlace[]=[]
 const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND sql NOT LIKE 'CREATE VIRTUAL TABLE%' AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' AND name NOT GLOB '*_fts*' AND (name NOT GLOB 'launch_search*' OR name='launch_search_rows')").all<{name:string}>()).results.map(t=>t.name).filter(name=>!name.startsWith('d1_migrations'))
 const places=input.places.filter(p=>tables.includes(p.table)),link=(p:IdentityPlace):Sql=>({sql:p.where,values:p.values(input.person)})
 for(const p of places)planned.push({store:p.columns?`${p.table}.${p.columns.join(',')}`:p.table,action:p.action,rows:(await db.prepare(`SELECT count(*) n FROM ${identifier(p.table)} WHERE coalesce((${p.where}),0)`).bind(...link(p).values).first<{n:number}>())!.n,reason:p.reason})
 for(const name of tables){
  const columns=(await db.prepare(`PRAGMA table_xinfo(${identifier(name)})`).all<Column>()).results.filter(c=>!c.hidden&&/TEXT|CHAR|CLOB|BLOB/i.test(c.type))
  for(const column of columns){
   const value=identifier(column.name),text=`CAST(${value} AS TEXT)`,store=`${name}.${column.name}`
   const decoded=needles.map(()=>"instr(CAST(atom AS TEXT),?)>0 OR instr(CAST(key AS TEXT),?)>0").join(' OR ')
   const contains:Sql={sql:`(${matches.map(()=>`instr(${text},?)>0`).join(' OR ')}) OR CASE WHEN json_valid(${value}) THEN EXISTS(SELECT 1 FROM json_tree(${value}) WHERE ${decoded}) ELSE 0 END`,values:[...matches,...needles.flatMap(n=>[n,n])]}
   const n=(await db.prepare(`SELECT count(*) n FROM ${identifier(name)} WHERE ${contains.sql}`).bind(...contains.values).first<{n:number}>())!.n
   change.guards.push(trustedPredicate(`(SELECT count(*) FROM ${identifier(name)} WHERE ${contains.sql})=?`,[...contains.values,n]))
   if(!n)continue
   const here=places.filter(p=>p.table===name&&(!p.columns||p.columns.includes(column.name))&&!(p.action==='scrub'&&isProtected(column)))
   const whole=any(here.filter(p=>p.action!=='scrub').map(link)),scrub=any(here.filter(p=>p.action==='scrub').map(link))
   const longer=longerToken(text,matches),other:Sql=others.length?{sql:`EXISTS(SELECT 1 FROM json_each(?) WHERE instr(${text},value)>0)`,values:[JSON.stringify(others)]}:{sql:'0',values:[]}
   const counts=(await db.prepare(`SELECT coalesce(sum(CASE WHEN W THEN 1 ELSE 0 END),0) whole,coalesce(sum(CASE WHEN NOT W AND S AND NOT L AND NOT O THEN 1 ELSE 0 END),0) clean,coalesce(sum(CASE WHEN NOT W AND O THEN 1 ELSE 0 END),0) other,coalesce(sum(CASE WHEN NOT W AND NOT O AND L THEN 1 ELSE 0 END),0) longer FROM (SELECT (${whole.sql}) W,(${scrub.sql}) S,coalesce((${longer.sql}),0) L,(${other.sql}) O FROM ${identifier(name)} WHERE ${contains.sql})`).bind(...whole.values,...scrub.values,...longer.values,...other.values,...contains.values).first<{whole:number;clean:number;other:number;longer:number}>())!
   const unattributed=n-counts.whole-counts.other-counts.longer-counts.clean,otherPerson=personIdentityColumns.has(store)
   if(unattributed&&custody.test(name))throw new AuthorityError('version_conflict',`Erasure requires explicit source-custody cleanup in ${name}; no identity was erased.`,409)
   if(unattributed&&isProtected(column))throw new AuthorityError('version_conflict',`Erasure literal overlaps a protected identity in ${store}.`,409)
   if(counts.other||(otherPerson&&unattributed))residual.push({store,rows:counts.other+(otherPerson?unattributed:0),reason:'other_person'})
   if(counts.longer)residual.push({store,rows:counts.longer,reason:'inside_longer_word'})
   if(unattributed&&!otherPerson)residual.push({store,rows:unattributed,reason:'not_attributed'})
   const target:Sql={sql:`(${contains.sql}) AND NOT (${whole.sql}) AND (${scrub.sql}) AND NOT (${longer.sql}) AND NOT (${other.sql})`,values:[...contains.values,...whole.values,...scrub.values,...longer.values,...other.values]}
   if(counts.clean)await replaceClean(db,change,name,column,target,counts.clean,needles,label)
   if(input.keep.has(store)&&(counts.other||counts.longer))await rewriteConfirmed(db,change,name,column,{sql:`(${contains.sql}) AND NOT (${whole.sql}) AND (${scrub.sql}) AND ((${longer.sql}) OR (${other.sql}))`,values:[...contains.values,...whole.values,...scrub.values,...longer.values,...other.values]},matches,label,others)
  }
 }
 for(const p of places.filter(p=>!p.appliedBy)){
  if(p.action==='delete')await removeRows(db,change,p.table,p.where,p.values(input.person))
  if(p.action==='set')await updateRows(db,change,p.table,p.set!(label,input.person),p.where,p.values(input.person))
 }
 return {planned,residual}
}
/** One counted replacement per column for rows whose every occurrence is a whole token. */
async function replaceClean(db:D1Database,change:Effects,name:string,column:Column,target:Sql,rows:number,needles:string[],label:string){
 const value=identifier(column.name),ordered=replacementOrder(needles),bindings:SqlScalar[]=[]
 const expression=(json:boolean)=>ordered.reduce((sql,needle)=>{bindings.push(json?escaped(needle):needle,json?escaped(label):label);return `replace(${sql},?,?)`},value)
 const redacted=`CASE WHEN json_valid(${value}) THEN ${expression(true)} ELSE ${expression(false)} END`
 const decoded=needles.map(()=>"instr(CAST(atom AS TEXT),?)>0 OR instr(CAST(key AS TEXT),?)>0").join(' OR '),decodedValues=needles.flatMap(n=>[n,n])
 const invalid=`EXISTS(SELECT 1 FROM (SELECT ${value} original,${redacted} redacted FROM ${identifier(name)} WHERE ${target.sql}) WHERE typeof(original)<>'text' OR CASE WHEN json_valid(original) THEN CASE WHEN NOT json_valid(redacted) THEN 1 ELSE EXISTS(SELECT 1 FROM json_tree(redacted) WHERE typeof(key)='text' GROUP BY parent,key HAVING count(*)>1) OR EXISTS(SELECT 1 FROM json_tree(original) WHERE type NOT IN ('text','array','object') AND (${decoded})) OR EXISTS(SELECT 1 FROM json_tree(redacted) WHERE ${decoded}) END ELSE 0 END)`
 const values=[...bindings,...target.values,...decodedValues,...decodedValues]
 if(await db.prepare(`SELECT 1 WHERE ${invalid}`).bind(...values).first())throw new AuthorityError('version_conflict',`Erasure requires resolving a JSON-key collision, non-string identity or binary custody in ${name}.${column.name}; no identity was erased.`,409)
 change.guards.push(trustedPredicate(`NOT (${invalid})`,values))
 change.mutations.push({kind:'replaceText',table:registerTable(name,[column.name]),column:column.name,needles:ordered,replacement:label,where:trustedPredicate(target.sql,target.values),expectedRows:rows})
}
/** Confirmed stores: attributed rows that also hold a longer word or another person's name. */
async function rewriteConfirmed(db:D1Database,change:Effects,name:string,column:Column,target:Sql,matches:string[],label:string,others:string[]){
 const keys=(await db.prepare(`PRAGMA table_xinfo(${identifier(name)})`).all<Column>()).results.filter(c=>c.pk>0).sort((a,b)=>a.pk-b.pk).map(c=>c.name)
 const key=keys.length?keys:['rowid'],select=key.map(k=>k==='rowid'?'rowid AS rowid':identifier(k)).join(',')
 const rows=(await db.prepare(`SELECT ${select},${identifier(column.name)} AS original FROM ${identifier(name)} WHERE ${target.sql}`).bind(...target.values).all<Record<string,SqlScalar>>()).results
 for(const row of rows){
  if(typeof row.original!=='string')throw new AuthorityError('version_conflict',`Erasure requires resolving binary custody in ${name}.${column.name}; no identity was erased.`,409)
  const json=await db.prepare('SELECT json_valid(?) ok').bind(row.original).first<{ok:number}>()
  const result=scrubWholeTokens(row.original,matches,json!.ok?escaped(label):label,others)
  if(!result.changed)continue
  if(json!.ok&&await db.prepare("SELECT CASE WHEN NOT json_valid(?1) THEN 1 ELSE EXISTS(SELECT 1 FROM json_tree(?1) WHERE typeof(key)='text' GROUP BY parent,key HAVING count(*)>1) END bad").bind(result.text).first<{bad:number}>().then(r=>r!.bad))throw new AuthorityError('version_conflict',`Erasure requires resolving a JSON-key collision in ${name}.${column.name}; no identity was erased.`,409)
  const where=key.map(k=>`${k==='rowid'?'rowid':identifier(k)}=?`).join(' AND ')+` AND ${identifier(column.name)} IS ?`
  change.mutations.push({kind:'update',table:registerTable(name,[column.name]),set:{[column.name]:result.text},where:trustedPredicate(where,[...key.map(k=>row[k]!),row.original]),expectedRows:1})
 }
}
