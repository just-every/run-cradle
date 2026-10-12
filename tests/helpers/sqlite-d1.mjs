import {DatabaseSync} from 'node:sqlite'
import {migrationInventory} from '../../scripts/migration-groups.mjs'
export function migratedD1(migrations=migrationInventory()){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON')
 for(const migration of migrations)sql.exec(migration.sql)
 const prepare=text=>{let args=[];const result=()=>{const s=sql.prepare(text);if(s.columns().length)return{success:true,results:s.all(...args),meta:{changes:0}};const r=s.run(...args);return{success:true,results:[],meta:{changes:Number(r.changes)}}};const statement={bind(...values){args=values;return statement},async first(){return sql.prepare(text).get(...args)??null},async all(){return result()},async run(){return result()},execute:result};return statement}
 return{sql,db:{prepare,async batch(statements){sql.exec('BEGIN');try{const output=statements.map(s=>s.execute());sql.exec('COMMIT');return output}catch(e){sql.exec('ROLLBACK');throw e}}},close:()=>sql.close()}
}
