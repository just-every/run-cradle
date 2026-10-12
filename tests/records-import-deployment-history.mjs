import assert from 'node:assert/strict'
import {DatabaseSync} from 'node:sqlite'
import {contract} from './contract.mjs'
import {migrationInventory} from '../scripts/migration-groups.mjs'
import {ownerPlan} from '../vendor/base/modules/deploy-kit/owner.mjs'
import {readFile} from 'node:fs/promises'
import {hash} from '../vendor/base/modules/deploy-kit/validation.mjs'
import {migrate,validateMigrations} from '../vendor/base/modules/deploy-kit/migrations.mjs'

contract('RECORDS-005 BASE-OPS-002','deployment upgrade planning preserves applied Base history and refuses the pending tail before provider writes',async()=>{
 const sql=new DatabaseSync(':memory:')
 try{
  const prior=migrationInventory(['core','base']).map(({name,sql})=>({name,sql,sha256:hash(sql)})),all=migrationInventory().map(({name,sql})=>({binding:'DB',name,sql,sha256:hash(sql)}))
  assert.ok(prior.length > 0)
  const declaration=JSON.parse(await readFile('deploy.json','utf8'))
  const plan=ownerPlan({project:declaration.project,environment:'test',worker:'upgrade-fixture',origin:'https://upgrade.example.test'},declaration,{migrations:all}),migrations=plan.d1[0].migrations
  validateMigrations(migrations)
  assert.deepEqual(migrations.slice(0,prior.length),prior,'Every applied SQL byte, hash and position stays unchanged')
  sql.exec("CREATE TABLE _rer_deploy_migrations(name TEXT PRIMARY KEY,sha256 TEXT NOT NULL,state TEXT NOT NULL)")
  for(const migration of prior)sql.prepare('INSERT INTO _rer_deploy_migrations VALUES(?,?,?)').run(migration.name,migration.sha256,'applied')
  const before=sql.prepare('SELECT * FROM _rer_deploy_migrations ORDER BY name').all(),changes=sql.prepare('SELECT total_changes() n').get().n,queries=[]
  // Recorded provider-query transport is test-only. The real deploy-kit checks
  // the real applied ledger; write SQL and every other endpoint are rejected.
  const api={async request(path,input){assert.equal(path,'/d1/database/fixture/query');assert.equal(input.method,'POST');const text=input.body.sql;assert.match(text,/^SELECT /);queries.push(text);return [{success:true,results:sql.prepare(text).all()}]}}
  await assert.rejects(migrate(api,'fixture',migrations,{apply:false}),error=>{assert.equal(error.message,'pending-migrations','The existing sorted prefix must be accepted before the no-write pending guard');return true})
  assert.ok(queries.length>=2);assert.equal(sql.prepare('SELECT total_changes() n').get().n,changes);assert.deepEqual(sql.prepare('SELECT * FROM _rer_deploy_migrations ORDER BY name').all(),before)
 }finally{sql.close()}
})
