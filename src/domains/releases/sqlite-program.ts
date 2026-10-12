/** Auditable independent rehearsal source, executed only inside the isolated runner. */
export const sqliteRehearsalProgram=String.raw`
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const input=JSON.parse(fs.readFileSync('/input/input.json','utf8'));
if(input.database)fs.writeFileSync('/tmp/rehearsal.sqlite',Buffer.from(input.database,'base64'));
const db=new DatabaseSync('/tmp/rehearsal.sqlite');
db.exec('PRAGMA foreign_keys=ON');
const results=[];
try{
 db.exec('BEGIN; PRAGMA defer_foreign_keys=ON');
 for(const command of input.statements){
  if(typeof command.sql!=='string'||command.sql.length>100000)throw new Error('invalid_rehearsal_statement');
  const statement=db.prepare(command.sql),values=command.values??[];
  if(command.kind==='all')results.push(statement.all(...values));
  else if(command.kind==='first')results.push(statement.get(...values)??null);
  else{const value=statement.run(...values);results.push({changes:Number(value.changes)});}
 }
 db.exec('COMMIT');
 const fk=db.prepare('PRAGMA foreign_key_check').all(),integrity=db.prepare('PRAGMA integrity_check').get();
 if(fk.length||integrity.integrity_check!=='ok')throw new Error('rehearsal_integrity_failed');
 db.close();
 fs.copyFileSync('/tmp/rehearsal.sqlite','/output/database.sqlite');
 fs.writeFileSync('/output/result.json',JSON.stringify({results,foreignKeysValid:true,integrity:'ok'}));
}catch(error){try{db.exec('ROLLBACK');}catch{}db.close();throw error;}
`;
