import {createUlid} from '../../src/core/shared/ids.ts'
import {compileSchema} from '../../src/domains/records/descriptors.server.ts'
import {ownerRules} from '../../src/domains/records/manual/authority.server.ts'
import {encodeValues} from '../../src/domains/records/codec.server.ts'
import {newField} from '../../src/ui/records/schema/templates.ts'
export const declaredProfile={recordsPerTable:250000,recordsPerBase:500000,fieldsPerTable:500,tablesPerBase:50,linkedRecords:10000,pageSize:100,samples:30,concurrency:1}
const diagnostic=process.argv.includes('--diagnostic-80-fields')
export const profile={...declaredProfile,fieldsPerTable:diagnostic?80:500,scope:diagnostic?'diagnostic: 80 fields; NOT the SCALE-001 profile':'declared SCALE-001 profile'}
const q=name=>'"'+name.replaceAll('"','""')+'"',literal=value=>value===null?'NULL':typeof value==='number'?String(value):"'"+value.replaceAll("'","''")+"'"
export async function seedProfile(h){
 const appId=createUlid(),now=new Date().toISOString(),owner=(await h.db.prepare('SELECT id FROM authority_principals WHERE initial_owner=1').first()).id,schemas=[],descriptors=[],fields=[],indexes=[]
 for(let i=0;i<50;i++){
  const title=newField('Title'),amount=newField('Amount','number'),stage=newField('Stage','select');stage.options=[{id:createUlid(),label:'Ready'},{id:createUlid(),label:'Shipped'}]
  const formula={...newField('Double','computed'),readOnly:true,resultType:'number',expression:{kind:'call',fn:'multiply',args:[{kind:'field',fieldId:amount.id},{kind:'literal',value:'2',valueType:'number'}]}}
  const list=[title,amount,stage,formula]
  if(i===0)for(let n=4;n<profile.fieldsPerTable;n++)list.push(newField('Flag '+n,'boolean'))
  const schema={id:createUlid(),appId,label:i===0?'Scale orders':'Scale table '+i,version:1,createdAt:now,updatedAt:now,physicalRevision:'manual_'+createUlid(),primaryFieldId:title.id,fields:list,lifecycle:{states:['active'],initial:'active',transitions:[]}}
  if(i===2){const links={...newField('Orders','relation'),relation:{ownerAppId:appId,entityId:schemas[0].id,cardinality:'many',onDelete:'restrict'}},rollup={...newField('Total','computed'),readOnly:true,resultType:'number',expression:{kind:'rollup',relationFieldId:links.id,valueFieldId:fields[0].amount.id,aggregate:'sum'}};list.push(links,rollup);fields.push({title,amount,stage,formula,links,rollup})}else fields.push({title,amount,stage,formula})
  const compiled=compileSchema(schema,(_app,id)=>descriptors.find(d=>d.schema.id===id));schemas.push(schema);descriptors.push(compiled.descriptor)
  // Schema and data setup is additive; every timed operation uses authenticated HTTP.
  for(const sql of compiled.sql){if(/^CREATE (?:UNIQUE )?INDEX /.test(sql))indexes.push(sql);else await h.db.prepare(sql).run()}
  await h.db.prepare('INSERT INTO record_schemas VALUES(?,?,?,?,?,?,?)').bind(schema.id,appId,1,schema.physicalRevision,JSON.stringify(schema),now,now).run()
 }
 const policyId=createUlid();await h.db.prepare('INSERT INTO authority_policies(id,app_id,name,rules_json,version,created_at,updated_at) VALUES(?,?,?,?,1,?,?)').bind(policyId,appId,'Measured scale owner',JSON.stringify(ownerRules(owner,schemas)),Date.now(),Date.now()).run();await h.db.prepare("INSERT INTO authority_memberships(principal_id,app_id,policy_id,legacy,state,version) VALUES(?,?,?,0,'active',1)").bind(owner,appId,policyId).run()
 for(const [index,count]of [[0,250000],[1,249999],[2,1]]){
  const d=descriptors[index],f=fields[index],column=field=>q(d.fields.get(field.id).column),amountOrders=Array.from({length:10},(_,i)=>encodeValues(d,{[f.amount.id]:String(i+1)},false)),orderColumn=q(d.fields.get(f.amount.id).sortColumn)
  for(let offset=0;offset<count;offset+=1000){const size=Math.min(1000,count-offset);await h.db.prepare(`WITH RECURSIVE n(x) AS (SELECT ? UNION ALL SELECT x+1 FROM n WHERE x<?) INSERT INTO ${q(d.table.tableId)}(id,version,created_at,updated_at,lifecycle,schema_version,${column(f.title)},${column(f.amount)},${orderColumn},${column(f.stage)}) SELECT printf('%026d',${index}*1000000+x+1),1,?,?,'active',1,'synthetic-cradle-'||printf('%06d',x),CAST(x%10+1 AS TEXT),CASE x%10 ${amountOrders.map((r,i)=>`WHEN ${i} THEN ${literal(r[d.fields.get(f.amount.id).sortColumn])}`).join(' ')} END,CASE x%2 WHEN 0 THEN ? ELSE ? END FROM n`).bind(offset,offset+size-1,now,now,f.stage.options[0].id,f.stage.options[1].id).run();if(offset%50000===0)console.log('scale seed',index,offset+size)}
 }
 const join=descriptors[2].fields.get(fields[2].links.id).join.table.tableId,parent=String(2000001).padStart(26,'0')
 for(let offset=0;offset<10000;offset+=1000)await h.db.prepare(`WITH RECURSIVE n(x) AS (SELECT ? UNION ALL SELECT x+1 FROM n WHERE x<?) INSERT INTO ${q(join)}(id,record_id,value,position) SELECT printf('%026d',x+8000000),?,printf('%026d',x+1),x FROM n`).bind(offset,offset+999,parent).run()
 // Build every real secondary index after additive loading to avoid repeated index maintenance during setup.
 for(let n=0;n<indexes.length;n+=10){await h.db.batch(indexes.slice(n,n+10).map(sql=>h.db.prepare(sql)));if(n%100===0)console.log('scale indexes',n+Math.min(10,indexes.length-n),indexes.length)}
 const countRows=[];for(const d of descriptors)countRows.push(Number((await h.db.prepare(`SELECT count(*) n FROM ${q(d.table.tableId)}`).first()).n))
 return {appId,schemas,descriptors,fields,counts:{tables:schemas.length,mainFields:schemas[0].fields.length,mainRecords:countRows[0],baseRecords:countRows.reduce((a,b)=>a+b,0)},parent}
}
