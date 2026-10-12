import {compileSchema, physicalName, type EntityDescriptor} from './descriptors.server';
import {entitySchema} from './validators';
import {launchDescriptors} from '../../apps/launch/descriptors.server';
import {registerTable} from '../admission/sql.server';

/** Reconstruct schema objects with the same compiler used for admitted releases. */
export function portableRecordSchema(groups: unknown[][]) {
 const sources = new Map(launchDescriptors.map(d => [d.schema.appId + ':' + d.schema.id, d]));
 const statements = new Map<string, string>();
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
   for (const sql of compiled.sql) {
    const name = /^CREATE (?:VIRTUAL |UNIQUE )?(?:TABLE|INDEX|TRIGGER) "([^"]+)"/.exec(sql)?.[1];
    if (!name) throw new Error('Unsupported compiler object');
    const prior=statements.get(name);
    if(prior && prior!==sql)throw new Error('Conflicting archived schema revisions');
    statements.set(name,sql);
   }
  }
 }
 return [...statements].map(([name,sql])=>({name,sql}));
}
