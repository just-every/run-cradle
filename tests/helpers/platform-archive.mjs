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
  const subject=(await db.prepare('SELECT id FROM campaigns ORDER BY id LIMIT 1').first()).id;
  await db.prepare("INSERT INTO record_watches(id,operator_id,principal_id,app_id,entity_id,target_kind,target_id,source,enabled,mode,channels_json,version,created_at,updated_at) VALUES('synthetic-cradle-150-watch','owner','owner','00000000000000000000000700','00000000000000000000000701','record',?,'manual',1,'daily','[\"in-app\",\"email\",\"slack\"]',1,10,10)").bind(subject).run();
  await db.prepare("INSERT INTO notifications(id,created_at,updated_at,version,operator_id,kind,subject_id,title,body,unavailable) VALUES('synthetic-cradle-150-notice',10,10,1,'owner','record-watch',?,'Daily watched changes','synthetic-cradle-150-retained-change',0)").bind(subject).run();
  await db.prepare("INSERT INTO record_watch_events(id,event_id,operator_id,app_id,entity_id,record_id,watch_id,assignment_field_id,actor_id,kind,mode,channels_json,title,body,required_fields_json,notification_id,created_at,due_at,completed_at) VALUES('synthetic-cradle-150-event','synthetic-cradle-150-event','owner','00000000000000000000000700','00000000000000000000000701',?,'synthetic-cradle-150-watch',NULL,'owner','record-watch','daily','[\"in-app\",\"email\",\"slack\"]','A watched record changed','synthetic-cradle-150-retained-change','[]','synthetic-cradle-150-notice',10,1000,NULL)").bind(subject).run();
  await db.prepare("INSERT INTO record_watch_chat_deliveries(id,notification_id,operator_id,provider,state,created_at,updated_at,provider_receipt) VALUES('synthetic-cradle-150-queued','synthetic-cradle-150-notice','owner','slack','queued',10,10,NULL),('synthetic-cradle-150-unknown','synthetic-cradle-150-notice','owner','teams','unknown',10,10,NULL)").run();
  const service=await createPortability({db,buckets:{FILES:installationBucket(db,bucket)},policy:{...portabilityPolicy,derivedTables:await derivedSearch(db)}})
  await exportArchive(service,directory+'/platform.rer',transient)
  await db.prepare('CREATE TABLE owner_unknown (id TEXT PRIMARY KEY, value TEXT)').run()
  await db.prepare("INSERT INTO owner_unknown VALUES('one','must refuse')").run()
  await exportArchive(service,directory+'/unknown.rer',transient)
  return ledger
 }finally{await runtime.dispose()}
}
