import { canonical } from '../admission/canonical';
import { identifier, registerTable } from '../admission/sql.server';
import { compileSchema, createDescriptorRegistry, physicalName, type EntityDescriptor } from './descriptors.server';
import { entitySchema } from './validators';
import type { EntitySchema } from './contracts';
/** Only retained choices may extend a source schema at the same version. */
function retainedSuperset(source: EntityDescriptor, schema: EntitySchema): EntityDescriptor | undefined {
    if (!source.legacy || source.schema.fields.length !== schema.fields.length) return;
    const fields = new Map(source.fields);
    const comparable = { ...schema, fields: schema.fields.map((field, index) => {
        const original = source.schema.fields[index]!;
        if (field.type !== 'select' || original.type !== 'select') return field;
        const base = original.options ?? [], options = field.options ?? [];
        if (options.length < base.length || base.some((option, i) => canonical(option) !== canonical(options[i]))) return field;
        const extra = options.slice(base.length), storage = source.fields.get(original.id);
        if (!storage?.selectValues || extra.some(option => option.retainedValue === undefined) || new Set(options.map(option => option.id)).size !== options.length) return field;
        const values = { ...storage.selectValues, ...Object.fromEntries(extra.map(option => [option.id, option.retainedValue!])) };
        if (new Set(Object.values(values)).size !== Object.keys(values).length) return field;
        fields.set(field.id, { ...storage, field, selectValues: values });
        return { ...field, options: base };
    }) };
    if (canonical(source.schema) !== canonical(comparable)) return;
    return { ...source, schema, fields };
}

/** Resolve the admitted metadata pointer afresh; source-owned protection survives schema adoption. */
export async function loadDescriptorRegistry(db: D1Database, sources: readonly EntityDescriptor[]) {
    const rows = await db.prepare("SELECT id,app_id,version,physical_revision,schema_json FROM record_schemas s WHERE NOT EXISTS(SELECT 1 FROM record_trash t WHERE t.app_id=s.app_id AND t.entity_id=s.id AND t.kind='table')").all<{
        id: string;
        app_id: string;
        version: number;
        physical_revision: string;
        schema_json: string;
    }>();
    const descriptors = new Map(sources.map(d => [d.schema.appId + ':' + d.schema.id, d]));
    const pending = rows.results.map(row => { const schema = entitySchema.parse(JSON.parse(row.schema_json)); if (schema.id !== row.id || schema.appId !== row.app_id || schema.version !== row.version || schema.physicalRevision !== row.physical_revision)
        throw new Error('Stored schema identity mismatch'); return schema; });
    for (const schema of pending) {
        const key = schema.appId + ':' + schema.id, source = descriptors.get(key);
        if (source && source.schema.version === schema.version) {
            if (canonical(source.schema) !== canonical(schema)) {
                const extended = retainedSuperset(source, schema);
                if (!extended) throw new Error('Source and stored schema disagree at the same revision');
                descriptors.set(key, extended);
            }
            continue;
        }
        if (source && source.schema.version > schema.version)
            throw new Error('Source descriptor is ahead of admitted schema');
        const tableName = physicalName(schema);
        descriptors.set(key, { schema, table: registerTable(tableName, ['id']), fields: new Map(), idColumn: 'id', versionColumn: 'version', createdColumn: 'created_at', updatedColumn: 'updated_at', lifecycleColumn: 'lifecycle', schemaVersionColumn: 'schema_version' });
    }
    for (const schema of pending) {
        const key = schema.appId + ':' + schema.id, source = sources.find(d => d.schema.appId === schema.appId && d.schema.id === schema.id);
        if (source?.schema.version === schema.version)
            continue;
        const prior = schema.version > 1 ? (source ?? descriptors.get(key)!) : undefined;
        descriptors.set(key, compileSchema(schema, (app, id) => descriptors.get(app + ':' + id), prior).descriptor);
    }
    for (const d of descriptors.values()) {
        const columns = await db.prepare(`PRAGMA table_xinfo(${identifier(d.table.tableId)})`).all<{
            name: string;
        }>();
        const actual = new Set(columns.results.map(c => c.name));
        if (!d.table.writableColumnIds.every(c => actual.has(c)))
            throw new Error('Admitted physical schema is unavailable: ' + d.table.tableId);
    }
    return createDescriptorRegistry([...descriptors.values()]);
}
