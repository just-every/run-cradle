import {compileSchema, physicalName, type EntityDescriptor} from './descriptors.server';
import {entitySchema} from './validators';
import {launchDescriptors} from '../../apps/launch/descriptors.server';
import {recordAutomationCaptureSchema} from '../automations/capture.server';
import {calendarCaptureSchema} from './calendar-sync/capture.server';
import {registerTable} from '../admission/sql.server';

/** Reconstruct schema objects with the same compiler used for admitted releases. */
export function portableRecordSchema(groups: unknown[][], calendarBindings: {app_id:string;entity_id:string}[] = [], automationBindings: {app_id:string;entity_id:string}[] = []) {
 const sources = new Map(launchDescriptors.map(d => [d.schema.appId + ':' + d.schema.id, d]));
 const statements = new Map<string, string>();
 const calendar = new Map<string, ReturnType<typeof calendarCaptureSchema>[number]>();
 const automation = new Map<string, ReturnType<typeof recordAutomationCaptureSchema>[number]>();
 for (const group of groups) {
  const schemas = group.map(value => entitySchema.parse(value));
  const descriptors = new Map<string, EntityDescriptor>(sources);
  for (const schema of schemas) {
   if (!physicalName(schema).startsWith('r_')) continue;
   const name = physicalName(schema);
   descriptors.set(schema.appId + ':' + schema.id, {schema, table:registerTable(name,['id']),fields:new Map(),idColumn:'id',versionColumn:'version',createdColumn:'created_at',updatedColumn:'updated_at',lifecycleColumn:'lifecycle',schemaVersionColumn:'schema_version'});
  }
  for (const schema of schemas) {
   if (!physicalName(schema).startsWith('r_')) continue;
   const skeleton = descriptors.get(schema.appId + ':' + schema.id)!;
   const compiled = compileSchema(schema,(app,id)=>descriptors.get(app+':'+id),schema.version>1?skeleton:undefined);
   descriptors.set(schema.appId + ':' + schema.id,compiled.descriptor);
   if(group===groups.at(-1) && calendarBindings.some(b=>b.app_id===schema.appId&&b.entity_id===schema.id))for(const plan of calendarCaptureSchema(compiled.descriptor))calendar.set(plan.name,plan);
   if(group===groups.at(-1) && automationBindings.some(b=>b.app_id===schema.appId&&b.entity_id===schema.id))for(const plan of recordAutomationCaptureSchema(compiled.descriptor))automation.set(plan.name,plan);
   for (const sql of compiled.sql) {
    const name = /^CREATE (?:VIRTUAL |UNIQUE )?(?:TABLE|INDEX|TRIGGER) "([^"]+)"/.exec(sql)?.[1];
    if (!name) throw new Error('Unsupported compiler object');
    const prior=statements.get(name);
    if(prior && prior!==sql)throw new Error('Conflicting archived schema revisions');
    statements.set(name,sql);
   }
  }
 }
 return [...statements].map(([name,sql])=>({name,sql,table:undefined as string|undefined})).concat([...calendar.values(),...automation.values()]);
}
