import type { EntitySchema } from './contracts';
import type { DescriptorRegistry, EntityDescriptor } from './descriptors.server';
import { compileSchema, physicalName } from './descriptors.server';
import { validateExpressionGraph } from './formulas';
import { schemaTable, schemaGuard } from './change.server';
import type { SqlMutation, SqlPredicate } from '../admission/ports';
import { eq, and } from '../admission/sql.server';
import { canonical, canonicalHash } from '../admission/canonical';
export type SchemaArtifact = {
    schema: EntitySchema;
    physicalSql: string[];
    sha256: string;
    source: string;
};
export async function compileSchemaArtifact(schema: EntitySchema, registry: DescriptorRegistry, prior?: EntityDescriptor): Promise<SchemaArtifact> { const compiled = compileSchema(schema, (app, id) => registry.list().find(d => d.schema.appId === app && d.schema.id === id), prior); validateExpressionGraph([...registry.list().filter(d => d.schema.id !== schema.id).map(d => d.schema), schema]); const physicalSql = compiled.sql, sha256 = await canonicalHash({ schema, physicalSql }); return { schema, physicalSql, sha256, source: `// Owner-editable Cradle entity source. Physical revision ${schema.physicalRevision}\nexport const schema = ${JSON.stringify(schema, null, 2)} as const;\n` }; }
async function stageStatement(db: D1Database, sql: string): Promise<void> { const match = sql.match(/^CREATE (?:VIRTUAL |UNIQUE )?(TABLE|INDEX|TRIGGER) "([^"]+)"/); if (!match)
    throw new Error('Only compiler-created schema objects may be staged'); const name = match[2]!; const normalize = (v: string) => v.replace(/IF NOT EXISTS /g, '').replace(/;\s*$/, '').replace(/\s+/g, ' ').trim(); const existing = await db.prepare('SELECT sql FROM sqlite_master WHERE name=?').bind(name).first<{
    sql: string;
}>(); if (existing) {
    if (normalize(existing.sql) !== normalize(sql))
        throw new Error('Staged physical schema differs from candidate artifact: ' + name);
    return;
} await db.prepare(sql).run(); const actual = await db.prepare('SELECT sql FROM sqlite_master WHERE name=?').bind(name).first<{
    sql: string;
}>(); if (!actual || normalize(actual.sql) !== normalize(sql))
    throw new Error('Staged schema verification failed: ' + name); }
/** Caller supplies isolated DB restored from the candidate's prior-data snapshot. Never production DB. */
export async function rehearseSchema(artifact: SchemaArtifact, isolatedDb: D1Database): Promise<{
    sha256: string;
    foreignKeysValid: true;
    integrity: 'ok';
}> { if (await canonicalHash({ schema: artifact.schema, physicalSql: artifact.physicalSql }) !== artifact.sha256)
    throw new Error('Schema artifact hash changed'); for (const sql of artifact.physicalSql)
    await isolatedDb.prepare(sql).run(); const fk = await isolatedDb.prepare('PRAGMA foreign_key_check').all(); if (fk.results.length)
    throw new Error('Candidate violates foreign keys'); const integrity = await isolatedDb.prepare('PRAGMA integrity_check').first<{
    integrity_check: string;
}>(); if (integrity?.integrity_check !== 'ok')
    throw new Error('Candidate integrity check failed'); return { sha256: artifact.sha256, foreignKeysValid: true, integrity: 'ok' }; }
export function prepareSchemaActivation(schema: EntitySchema, prior?: EntityDescriptor): {
    guards: SqlPredicate[];
    mutations: SqlMutation[];
} { const row = { id: schema.id, app_id: schema.appId, version: schema.version, physical_revision: schema.physicalRevision, schema_json: canonical(schema), created_at: schema.createdAt, updated_at: schema.updatedAt }; return prior ? { guards: [schemaGuard(prior)], mutations: [{ kind: 'update', table: schemaTable, set: row, where: and(eq(schemaTable, 'id', prior.schema.id), eq(schemaTable, 'version', prior.schema.version)), expectedRows: 1 }] } : { guards: [], mutations: [{ kind: 'insert', table: schemaTable, row }] }; }
/** Stages a disjoint physical revision. No live-table ALTER/DROP and no pointer change. */
export async function stageSchema(artifact: SchemaArtifact, registry: DescriptorRegistry, liveDb: D1Database, prior?: EntityDescriptor): Promise<EntityDescriptor> {
    const compiled = compileSchema(artifact.schema, (app, id) => registry.list().find(d => d.schema.appId === app && d.schema.id === id), prior);
    if (await canonicalHash({ schema: artifact.schema, physicalSql: compiled.sql }) !== artifact.sha256)
        throw new Error('Physical artifact differs from trusted compiler');
    if (prior && compiled.descriptor.table.tableId === prior.table.tableId)
        throw new Error('Staging must use a disjoint physical revision');
    for (const sql of compiled.sql)
        await stageStatement(liveDb, sql);
    return compiled.descriptor;
}
/** Typed copy/backfill is admitted with source-row/count fences and the schema pointer switch. */
export async function preparePhysicalActivation(liveDb: D1Database, next: EntityDescriptor, prior?: EntityDescriptor, backfill: Readonly<Record<string, import('../../contracts/primitives').CellValue>> = {}): Promise<{
    guards: SqlPredicate[];
    mutations: SqlMutation[];
}> {
    const { encodeValues, decode } = await import('./codec.server');
    const { identifier, trustedPredicate, exists } = await import('../admission/sql.server');
    const { createUlid } = await import('../../core/shared/ids');
    const metadata = prepareSchemaActivation(next.schema, prior);
    if (!prior)
        return metadata;
    const rows = await liveDb.prepare(`SELECT * FROM ${identifier(prior.table.tableId)} ORDER BY ${identifier(prior.idColumn)}`).all<Record<string, unknown>>();
    const guards: SqlPredicate[] = [...metadata.guards, trustedPredicate(`(SELECT COUNT(*) FROM ${identifier(prior.table.tableId)})=?`, [rows.results.length]), trustedPredicate(`NOT EXISTS(SELECT 1 FROM ${identifier(next.table.tableId)})`)];
    const mutations: SqlMutation[] = [];
    for (const row of rows.results) {
        const values: Record<string, import('../../contracts/primitives').CellValue> = { ...backfill };
        for (const [id, storage] of prior.fields)
            if (storage.field.type !== 'computed' && !storage.join && next.fields.has(id))
                values[id] = decode(storage, row);
        const id = String(row[prior.idColumn]);
        guards.push(exists(prior.table, and(eq(prior.table, prior.idColumn, id), eq(prior.table, prior.versionColumn, Number(row[prior.versionColumn])))));
        mutations.push({ kind: 'insert', table: next.table, row: { ...encodeValues(next, values, true), [next.idColumn]: id, [next.versionColumn]: Number(row[prior.versionColumn]), [next.createdColumn]: String(row[prior.createdColumn]), [next.updatedColumn]: String(row[prior.updatedColumn]), [next.lifecycleColumn]: String(row[prior.lifecycleColumn]), [next.schemaVersionColumn]: next.schema.version } });
        for (const [fieldId, s] of prior.fields) {
            if (!s.join)
                continue;
            const target = next.fields.get(fieldId)?.join;
            if (!target) { if (!next.fields.has(fieldId)) continue; throw new Error('Collection migration requires preserved target'); }
            const links = await liveDb.prepare(`SELECT value,position FROM ${identifier(s.join.table.tableId)} WHERE record_id=? ORDER BY position`).bind(id).all<{
                value: string;
                position: number;
            }>();
            for (const link of links.results)
                mutations.push({ kind: 'insert', table: target.table, row: { id: createUlid(), record_id: id, value: link.value, position: link.position } });
        }
    }
    return { guards, mutations: [...mutations, ...metadata.mutations] };
}
/** A changed target requires restaging every incoming FK owner; this closure keeps physical FKs canonical. */
export async function compileSchemaSet(schemas: readonly EntitySchema[], registry: DescriptorRegistry, removals: Readonly<Record<string, readonly string[]>> = {}): Promise<{
    artifacts: SchemaArtifact[];
    descriptors: EntityDescriptor[];
}> {
    const ids = new Set(schemas.map(s => s.appId + ':' + s.id));
    for (const d of registry.list())
        for (const f of d.schema.fields)
            if (f.relation && ids.has(f.relation.ownerAppId + ':' + f.relation.entityId) && !ids.has(d.schema.appId + ':' + d.schema.id))
                throw new Error('Schema migration must include every incoming relation owner');
    const skeletons = new Map<string, EntityDescriptor>();
    for (const schema of schemas) {
        const prior = registry.list().find(d => d.schema.id === schema.id && d.schema.appId === schema.appId);
        if (prior && schema.version <= prior.schema.version)
            throw new Error('Schema version must advance');
        const name = physicalName(schema);
        const { registerTable } = await import('../admission/sql.server');
        skeletons.set(schema.appId + ':' + schema.id, { schema, table: registerTable(name, ['id']), fields: new Map(), idColumn: 'id', versionColumn: 'version', createdColumn: 'created_at', updatedColumn: 'updated_at', lifecycleColumn: 'lifecycle', schemaVersionColumn: 'schema_version' });
    }
    const artifacts: SchemaArtifact[] = [], descriptors: EntityDescriptor[] = [];
    for (const schema of schemas) {
        const prior = registry.list().find(d => d.schema.id === schema.id && d.schema.appId === schema.appId);
        const compiled = compileSchema(schema, (app, id) => skeletons.get(app + ':' + id) ?? registry.list().find(d => d.schema.appId === app && d.schema.id === id), prior, removals[schema.id]);
        descriptors.push(compiled.descriptor);
        const physicalSql = compiled.sql;
        artifacts.push({ schema, physicalSql, sha256: await canonicalHash({ schema, physicalSql }), source: `export const schema = ${JSON.stringify(schema, null, 2)} as const;\n` });
    }
    validateExpressionGraph([...registry.list().filter(d => !ids.has(d.schema.appId + ':' + d.schema.id)).map(d => d.schema), ...schemas]);
    return { artifacts, descriptors };
}
export async function stageSchemaSet(compiled: Awaited<ReturnType<typeof compileSchemaSet>>, liveDb: D1Database, registry: DescriptorRegistry, removals: Readonly<Record<string, readonly string[]>> = {}): Promise<void> { const verified = await compileSchemaSet(compiled.artifacts.map(a => a.schema), registry, removals); for (let i = 0; i < verified.artifacts.length; i++) {
    if (verified.artifacts[i]!.sha256 !== compiled.artifacts[i]!.sha256)
        throw new Error('Untrusted physical schema artifact');
    for (const sql of verified.artifacts[i]!.physicalSql)
        await stageStatement(liveDb, sql);
} }
export async function prepareSchemaSetActivation(liveDb: D1Database, compiled: Awaited<ReturnType<typeof compileSchemaSet>>, registry: DescriptorRegistry, backfills: Readonly<Record<string, Readonly<Record<string, import('../../contracts/primitives').CellValue>>>> = {}): Promise<{
    guards: SqlPredicate[];
    mutations: SqlMutation[];
}> { const plans = []; for (const next of compiled.descriptors) {
    const prior = registry.list().find(d => d.schema.id === next.schema.id && d.schema.appId === next.schema.appId);
    plans.push(await preparePhysicalActivation(liveDb, next, prior, backfills[next.schema.id]));
} return { guards: plans.flatMap(p => p.guards), mutations: plans.flatMap(p => p.mutations) }; }
