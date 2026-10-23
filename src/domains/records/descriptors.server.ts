import {AdmissionError} from '../admission/errors'
import {capacitySql} from './capacity.server'
import type { EntitySchema, Field } from './contracts';
import type { SqlPredicate, TableHandle } from '../admission/ports';
import { registerTable, identifier } from '../admission/sql.server';
import { entitySchema } from './validators';
export type FieldStorage = {
    field: Field;
    column: string;
    sortColumn?: string;
    currencyColumn?: string;
    scaleColumn?: string;
    join?: {
        table: TableHandle;
        valueColumn: string;
        targetTable?: string;
    };
};
export type RecordWritePolicy = {
    create?: boolean;
    patch?: boolean;
    delete?: boolean;
    transitions?: readonly string[];
    protectedFieldIds?: readonly string[];
    validate?: (ctx: import('../authority/ports').RequestContext, input: {
        operation: 'create' | 'patch' | 'transition' | 'delete' | 'undo';
        ref: import('../../contracts/primitives').Ref;
        expectedVersion: number;
        changes: Readonly<Record<string, import('../../contracts/primitives').CellValue>>;
        prior: Readonly<Record<string, unknown>> | null;
        nextLifecycle?: string;
    }) => Promise<{
        guards: import('../admission/ports').SqlPredicate[];
    }>;
};
export type EntityDescriptor = {
    searchTable?: string;
    /** Source-owned search fields and combined index; index use requires every contributing field. */
    search?: {
        fieldIds: readonly string[];
        index?: { table: string; columns: readonly string[]; where?: SqlPredicate };
        activeRows?: SqlPredicate;
    };
    writePolicy?: RecordWritePolicy;
    schema: EntitySchema;
    table: TableHandle;
    fields: ReadonlyMap<string, FieldStorage>;
    idColumn: string;
    versionColumn: string;
    createdColumn: string;
    updatedColumn: string;
    lifecycleColumn: string;
    schemaVersionColumn: string;
    legacy?: boolean;
};
export type DescriptorRegistry = {
    get(appId: string, entityId: string): EntityDescriptor;
    list(appId?: string): EntityDescriptor[];
};
export function createDescriptorRegistry(descriptors: readonly EntityDescriptor[]): DescriptorRegistry {
    const map = new Map<string, EntityDescriptor>();
    for (const d of descriptors) {
        const key = d.schema.appId + ':' + d.schema.id;
        if (map.has(key))
            throw new Error('Duplicate entity descriptor');
        map.set(key, d);
    }
    return { get(appId, entityId) { const d = map.get(appId + ':' + entityId); if (!d)
            throw new Error('Unknown registered entity'); return d; }, list(appId) { return [...map.values()].filter(d => !appId || d.schema.appId === appId); } };
}
export function generatedName(id: string): string { return 'r_' + id.toLowerCase(); }
export function physicalName(schema: EntitySchema): string { return generatedName(schema.id) + (schema.version > 1 ? '_v' + schema.version : '') + (/^manual_[0-9A-HJKMNP-TV-Z]{26}$/.test(schema.physicalRevision) ? '_' + schema.physicalRevision.toLowerCase() : '') }
export function compileSchema(input: EntitySchema, resolve: (appId: string, entityId: string) => EntityDescriptor | undefined, prior?: EntityDescriptor, removedFieldIds: readonly string[] = [], reviewedConvertedFieldIds: readonly string[] = []): {
    descriptor: EntityDescriptor;
    sql: string[];
} {
    const schema = entitySchema.parse(input);
    if (schema.primaryFieldId && !schema.fields.some(f => f.id === schema.primaryFieldId && !['relation', 'attachment', 'multi_select'].includes(f.type))) throw new Error('Primary field must identify a scalar field in this table');
    if (!prior && schema.version !== 1)
        throw new Error('Initial schema version must be one');
    if (new Set(schema.fields.map(f => f.id)).size !== schema.fields.length)
        throw new Error('Duplicate immutable field ID');
    if (!schema.lifecycle.states.includes(schema.lifecycle.initial) || schema.lifecycle.transitions.some(t => !schema.lifecycle.states.includes(t.to) || t.from.some(s => !schema.lifecycle.states.includes(s))))
        throw new Error('Invalid lifecycle graph');
    if (prior && (prior.schema.id !== schema.id || prior.schema.appId !== schema.appId))
        throw new Error('Entity identity cannot change');
    if (prior) {
        for (const old of prior.schema.fields) {
            const next = schema.fields.find(f => f.id === old.id);
            if (!next && !removedFieldIds.includes(old.id))
                throw new Error('Removing a field requires an explicit expand/migrate/contract release');
            if (!next) continue;
            if (old.readOnly && !next.readOnly)
                throw new Error('Protected field cannot become generic-writable in schema adoption');
            if ((old.type !== next.type || JSON.stringify(old.relation) !== JSON.stringify(next.relation)) && !reviewedConvertedFieldIds.includes(old.id))
                throw new Error('Changing physical type requires an explicit migration');
        }
    }
    const tableName = physicalName(schema), cols = ['id', 'version', 'created_at', 'updated_at', 'lifecycle', 'schema_version'];
    const defs = ['id TEXT PRIMARY KEY NOT NULL', 'version INTEGER NOT NULL CHECK(version>0)', 'created_at TEXT NOT NULL', 'updated_at TEXT NOT NULL', 'lifecycle TEXT NOT NULL', 'schema_version INTEGER NOT NULL CHECK(schema_version>0)'];
    const fields = new Map<string, FieldStorage>(), extra: string[] = [], added: string[] = [];
    for (const field of schema.fields) {
        if (field.type === 'computed') {
            if (!field.expression || !field.resultType || field.resultType === 'computed')
                throw new Error('Computed field needs expression and concrete result type');
            fields.set(field.id, { field, column: '' });
            continue;
        }
        const base = prior?.fields.get(field.id)?.column ?? 'f_' + field.id.toLowerCase();
        identifier(base);
        const storage: FieldStorage = { field, column: base };
        fields.set(field.id, storage);
        if (field.required && field.relation?.onDelete === 'unlink')
            throw new Error('Required relation cannot unlink');
        const multiple = field.type === 'multi_select' || field.type === 'attachment' || (field.type === 'relation' && field.relation?.cardinality === 'many');
        const target = field.type === 'relation' ? (field.relation?.entityId === schema.id ? { table: { tableId: tableName } } : field.relation && resolve(field.relation.ownerAppId, field.relation.entityId)) : undefined;
        if (field.type === 'relation' && !target)
            throw new Error('Relation target must be registered before migration');
        if (multiple) {
            if (field.unique)
                throw new Error('Collection fields cannot be unique');
            const joinName = tableName + '_' + base, join = registerTable(joinName, ['id', 'record_id', 'value', 'position']);
            storage.join = { table: join, valueColumn: 'value', targetTable: target?.table.tableId };
            extra.push(`CREATE TABLE ${identifier(joinName)} (id TEXT PRIMARY KEY NOT NULL,record_id TEXT NOT NULL REFERENCES ${identifier(tableName)}(id) ON DELETE CASCADE,value TEXT NOT NULL${target ? ` REFERENCES ${identifier(target.table.tableId)}(id) ON DELETE ${field.relation?.onDelete === 'restrict' ? 'RESTRICT' : 'CASCADE'}` : ''},position INTEGER NOT NULL,UNIQUE(record_id,value));`, `CREATE INDEX ${identifier(joinName + '_reverse')} ON ${identifier(joinName)}(value,record_id);`);
            continue;
        }
        const columnDefs = [`${identifier(base)} ${field.type === 'boolean' ? 'INTEGER' : 'TEXT'}${field.required ? ' NOT NULL' : ''}${field.type === 'boolean' ? ` CHECK(${identifier(base)} IN (0,1))` : ''}${field.unique && field.type !== 'money' ? ' UNIQUE' : ''}${target ? ` REFERENCES ${identifier(target.table.tableId)}(id) ON DELETE ${field.relation?.onDelete === 'unlink' ? 'SET NULL' : field.relation?.onDelete === 'restrict' ? 'RESTRICT' : 'CASCADE'}` : ''}`];
        cols.push(base);
        if (field.type === 'number' || field.type === 'money') {
            storage.sortColumn = base + '_order';
            cols.push(storage.sortColumn);
            columnDefs.push(`${identifier(storage.sortColumn)} TEXT${field.required ? ' NOT NULL' : ''} CHECK(length(${identifier(storage.sortColumn)})=161)`);
        }
        if (field.type === 'money') {
            storage.currencyColumn = base + '_currency';
            storage.scaleColumn = base + '_scale';
            cols.push(storage.currencyColumn, storage.scaleColumn);
            columnDefs.push(`${identifier(storage.currencyColumn)} TEXT${field.required ? ' NOT NULL' : ''}`, `${identifier(storage.scaleColumn)} INTEGER${field.required ? ' NOT NULL' : ''}`);
        }
        defs.push(...columnDefs);
        if (!prior?.fields.has(field.id))
            added.push(...columnDefs.map(def => `ALTER TABLE ${identifier(tableName)} ADD COLUMN ${def};`));
        if (field.unique && field.type === 'money')
            extra.push(`CREATE UNIQUE INDEX ${identifier(tableName + '_' + base + '_unique')} ON ${identifier(tableName)}(${identifier(base)},${identifier(storage.currencyColumn!)},${identifier(storage.scaleColumn!)});`);
        extra.push(`CREATE INDEX ${identifier(tableName + '_' + base + '_idx')} ON ${identifier(tableName)}(${identifier(storage.sortColumn ?? base)},id);`);
    }
    if(cols.length>100)throw new AdmissionError('capacity_limit',`D1 physical columns limit 100 CURRENT ${cols.length}. This table needs a wider storage layout before it can be adopted.`);
    const searchable = [...fields.values()].filter(s => ['text', 'url'].includes(s.field.type) && !s.join);
    const searchTable = searchable.length ? tableName + '_search' : undefined;
    if (searchTable) {
        const quoted = identifier(searchTable), searchCols = searchable.map(s => identifier(s.column));
        extra.push(`CREATE VIRTUAL TABLE ${quoted} USING fts5(record_id UNINDEXED,${searchCols.join(',')}, tokenize='unicode61');`, `CREATE TRIGGER ${identifier(tableName + '_search_insert')} AFTER INSERT ON ${identifier(tableName)} BEGIN INSERT INTO ${quoted}(record_id,${searchCols.join(',')}) VALUES(new.id,${searchable.map(s => 'new.' + identifier(s.column)).join(',')}); END;`, `CREATE TRIGGER ${identifier(tableName + '_search_delete')} AFTER DELETE ON ${identifier(tableName)} BEGIN DELETE FROM ${quoted} WHERE record_id=old.id; END;`, `CREATE TRIGGER ${identifier(tableName + '_search_update')} AFTER UPDATE ON ${identifier(tableName)} BEGIN DELETE FROM ${quoted} WHERE record_id=old.id; INSERT INTO ${quoted}(record_id,${searchCols.join(',')}) VALUES(new.id,${searchable.map(s => 'new.' + identifier(s.column)).join(',')}); END;`);
    }
    const descriptor: EntityDescriptor = { searchTable, writePolicy: prior?.writePolicy, schema, table: registerTable(tableName, cols), fields, idColumn: 'id', versionColumn: 'version', createdColumn: 'created_at', updatedColumn: 'updated_at', lifecycleColumn: 'lifecycle', schemaVersionColumn: 'schema_version' };
    const sql = [`CREATE TABLE ${identifier(tableName)} (${defs.join(',')});`, `CREATE INDEX ${identifier(tableName + '_lifecycle')} ON ${identifier(tableName)}(lifecycle,id);`, ...extra,...capacitySql(descriptor)];
    return { descriptor, sql };
}
/** Explicit author-owned mapping: shares the existing table and IDs, never copies records. */
export function existingDescriptor(schema: EntitySchema, mapping: {
    table: string;
    id: string;
    version: string;
    createdAt: string;
    updatedAt: string;
    lifecycle: string;
    schemaVersion: string;
    fields: Record<string, {
        column: string;
        orderColumn?: string;
        currencyColumn?: string;
        scaleColumn?: string;
    }>;
}): EntityDescriptor {
    entitySchema.parse(schema);
    const fields = new Map<string, FieldStorage>();
    const columns = new Set([mapping.id, mapping.version, mapping.createdAt, mapping.updatedAt, mapping.lifecycle, mapping.schemaVersion]);
    for (const field of schema.fields) {
        const storage = mapping.fields[field.id];
        if (!storage && field.type !== 'computed')
            throw new Error('Missing existing field mapping');
        const mapped = { field, column: storage?.column ?? '', sortColumn: storage?.orderColumn, currencyColumn: storage?.currencyColumn, scaleColumn: storage?.scaleColumn };
        fields.set(field.id, mapped);
        for (const col of [mapped.column, mapped.sortColumn, mapped.currencyColumn, mapped.scaleColumn])
            if (col)
                columns.add(col);
    }
    return { schema, table: registerTable(mapping.table, [...columns]), fields, idColumn: mapping.id, versionColumn: mapping.version, createdColumn: mapping.createdAt, updatedColumn: mapping.updatedAt, lifecycleColumn: mapping.lifecycle, schemaVersionColumn: mapping.schemaVersion, legacy: true };
}
