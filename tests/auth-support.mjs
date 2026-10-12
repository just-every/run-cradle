import { registerHooks } from 'node:module'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { DatabaseSync } from 'node:sqlite'
registerHooks({resolve(specifier,context,next){if(specifier.startsWith('.')&&context.parentURL){for(const suffix of ['.ts','/index.ts']){const url=new URL(specifier+suffix,context.parentURL);if(existsSync(url))return next(url.href,context)}}return next(specifier,context)},load(url,context,next){if(url.endsWith('.ts'))return {format:'module',source:ts.transpileModule(readFileSync(fileURLToPath(url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,shortCircuit:true};return next(url,context)}})
export const fixture=()=>{
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON')
 for(const file of ['0000_foundation.sql','0001_portfolio_spine.sql','0100_authority.sql','0101_authority_previews.sql','0102_native_auth_mail.sql','0103_authority_epochs.sql','0104_authority_restore_hold.sql','0105_reservation_binding.sql'])sql.exec(readFileSync(new URL('../migrations/core/'+file,import.meta.url),'utf8'))
 sql.exec(readFileSync(new URL('../migrations/updates/9015_user_automation_authority.sql',import.meta.url),'utf8'))
 const prepare=(text)=>{let args=[];const raw=()=>sql.prepare(text);const statement={bind(...values){args=values;return statement},async first(){return raw().get(...args)??null},async all(){return {results:raw().all(...args),success:true}},async run(){const r=raw().run(...args);return {success:true,meta:{changes:Number(r.changes)}}},_run(){const statement=raw();if(statement.columns().length)return {success:true,results:statement.all(...args),meta:{changes:0}};const r=statement.run(...args);return {success:true,results:[],meta:{changes:Number(r.changes)}}}};return statement}
 const db={prepare,async exec(text){sql.exec(text);return {success:true}},async batch(statements){sql.exec('BEGIN');try{const result=statements.map(s=>s._run());sql.exec('COMMIT');return result}catch(e){sql.exec('ROLLBACK');throw e}}}
 const id='01J00000000000000000000001',now=Date.now();sql.prepare('INSERT INTO operators(id,created_at,updated_at,name,email) VALUES(?,?,?,?,?)').run(id,now,now,'Owner','owner@example.test');sql.prepare(`INSERT INTO authority_principals(id,kind,human_id,state,created_at,updated_at) VALUES(?,'human',?,'active',?,?)`).run(id,id,now,now)
 return {db,sql,id,close:()=>sql.close()}
}
