import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {Miniflare,convertV4MiniflareOptions,Log,LogLevel} from 'miniflare'
import {createPortability} from '@runeditrun/rer/modules/portability'
import {exportArchive} from '@runeditrun/rer/modules/portability/files'
import {installationBucket} from '../../scripts/portability/bucket.mjs'
import {portabilityPolicy,transient} from '../../scripts/portability/policy.mjs'
import {derivedSearch} from '../../scripts/portability/records.mjs'
import {seedData,useRuntimeBindings} from './rer-data-fixture.mjs'

const {unstable_splitSqlQuery:split}=createRequire(import.meta.url)('wrangler')
// RER Platform's ledger DDL. Its runner applies each file in plan order as one
// request holding the file's ledger row and its statements, DDL text unchanged.
export const platformLedger='CREATE TABLE rer_migrations (name TEXT PRIMARY KEY, sha256 TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'
export async function platformInstall(db){
 const {migrations}=JSON.parse(await readFile('management/integration/deployment-spec.json','utf8'))
 await db.prepare(platformLedger).run()
 for(const m of migrations)await db.batch([db.prepare('INSERT INTO rer_migrations(name,sha256) VALUES(?,?)').bind(m.name,m.sha256),...split(m.sql).map(sql=>db.prepare(sql))])
}
/** Native exports of a populated Platform-installed database: platform.rer, and unknown.rer carrying one table no migration made. */
export async function platformArchive(directory){
 const runtime=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response(null)}}',log:new Log(LogLevel.ERROR),d1Databases:{DB:'platform-archive'},r2Buckets:{FILES:'platform-files'}}))
 try{
  const db=await runtime.getD1Database('DB'),bucket=await runtime.getR2Bucket('FILES')
  await platformInstall(db)
  const ledger=(await db.prepare('SELECT name,sha256 FROM rer_migrations ORDER BY rowid').all()).results
  await db.prepare("INSERT INTO operators(id,created_at,updated_at,name,email,active) VALUES('owner',1,2,'Maya Chen','maya@example.test',1)").run()
  await db.prepare("INSERT INTO workspace(id,created_at,updated_at,name,timezone,currency) VALUES('workspace',1,2,'Northwind launch','UTC','USD')").run()
  const release=useRuntimeBindings(process.cwd(),{DB:db,FILES:bucket})
  try{await seedData(process.cwd())}finally{release()}
  const service=await createPortability({db,buckets:{FILES:installationBucket(db,bucket)},policy:{...portabilityPolicy,derivedTables:await derivedSearch(db)}})
  await exportArchive(service,directory+'/platform.rer',transient)
  await db.prepare('CREATE TABLE owner_unknown (id TEXT PRIMARY KEY, value TEXT)').run()
  await db.prepare("INSERT INTO owner_unknown VALUES('one','must refuse')").run()
  await exportArchive(service,directory+'/unknown.rer',transient)
  return ledger
 }finally{await runtime.dispose()}
}
