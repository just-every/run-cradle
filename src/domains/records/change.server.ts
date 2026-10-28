import {trashTable,trashLifetime} from './trash/storage.server'
import {recordCapacityGuard} from './capacity.server'
import type { RecordMutationEffects } from './effects.server';
import type { RecordAttachmentPort } from './attachments.server';
import type { AttachmentMember, CellValue, Ref, Cell, StoreReference } from '../../contracts/primitives';
import { referenceValue } from './store-references';
import type { PolicyPort, PolicyScope, RequestContext } from '../authority/ports';
import type { DescriptorRegistry, EntityDescriptor, FieldStorage } from './descriptors.server';
import type { PreparedRecordChange } from './ports';
import type { SqlMutation, SqlPredicate } from '../admission/ports';
import { registerTable, and, eq, exists, trustedPredicate, identifier } from '../admission/sql.server';
import { createUlid } from '../../core/shared/ids';
import { encodeValues } from './codec.server';
import { validateCell } from './validators';
import { createRecordReader } from './query.server';
import { createDeleteImpact } from './delete-impact.server';
import { canonicalHash, canonical } from '../admission/canonical';
import { AdmissionError } from '../admission/errors';
import { assertRecordValidation } from './validation-rules';
import { storedValidationValues, uniqueValidationGuards } from './validation-values.server';
export const schemaTable = registerTable('record_schemas', ['id', 'app_id', 'version', 'physical_revision', 'schema_json', 'created_at', 'updated_at']);
export function schemaGuard(d: EntityDescriptor): SqlPredicate { return exists(schemaTable, and(eq(schemaTable, 'id', d.schema.id), eq(schemaTable, 'app_id', d.schema.appId), eq(schemaTable, 'version', d.schema.version), eq(schemaTable, 'physical_revision', d.schema.physicalRevision))); }
export function createRecordWriter(db: D1Database, registry: DescriptorRegistry, policy: PolicyPort, reader: ReturnType<typeof createRecordReader>, attachments?: RecordAttachmentPort, effects?: RecordMutationEffects) {
    const deletionImpact = createDeleteImpact(db, registry, policy, reader);
    async function invariant(ctx: RequestContext, d: EntityDescriptor, operation: 'create' | 'patch' | 'transition' | 'delete' | 'undo', ref: Ref, expectedVersion: number, changes: Record<string, CellValue>, prior: Record<string, unknown> | null, nextLifecycle?: string): Promise<SqlPredicate[]> { const rules = d.writePolicy; if ((operation === 'create' && rules?.create === false) || (operation === 'patch' && rules?.patch === false) || (operation === 'delete' && rules?.delete === false) || (operation === 'undo' && (rules?.patch === false || rules?.transitions?.length === 0)))
        throw new AdmissionError('forbidden', 'This entity requires a typed domain action'); if (Object.keys(changes).some(id => rules?.protectedFieldIds?.includes(id) || d.fields.get(id)?.field.readOnly))
        throw new AdmissionError('forbidden', 'This field requires a typed domain action'); return (await rules?.validate?.(ctx, { operation, ref, expectedVersion, changes, prior, nextLifecycle }))?.guards ?? []; }
    /** A reference already stored on this record stays as it is; a new one must come from the writer's own connected store. */
    async function storeReferenceGuards(ctx: RequestContext, d: EntityDescriptor, recordId: string, storage: FieldStorage, reference: StoreReference,verified?:ReadonlyMap<string,readonly SqlPredicate[]>): Promise<SqlPredicate[]> {
        const kept = await db.prepare(`SELECT 1 AS present FROM ${identifier(storage.join!.table.tableId)} WHERE record_id=? AND value=?`).bind(recordId, referenceValue(reference)).first();
        if (kept)
            return [];
        const proof=verified?.get(referenceValue(reference));if(proof)return [...proof];
        if(reference.portable||reference.resolution)throw new AdmissionError('forbidden','Returned references can only be preserved on their imported record until resolved.');
        if (reference.attachedBy !== ctx.principal.id)
            throw new AdmissionError('forbidden', 'A store reference is attached by the person whose store it comes from');
        if (reference.provider === 'chest')
            return reference.connectionId ? (() => { throw new AdmissionError('validation', 'A Chest link carries no connection'); })() : [];
        if (!reference.connectionId)
            throw new AdmissionError('validation', 'A store reference needs the connection it was picked through');
        const guard = trustedPredicate("EXISTS(SELECT 1 FROM provider_connections WHERE id=? AND adapter_id=? AND owner_id=? AND state='connected' AND revoked_at IS NULL AND EXISTS(SELECT 1 FROM file_store_policies WHERE provider=adapter_id AND enabled=1))", [reference.connectionId, reference.provider, ctx.principal.id]);
        const live = await db.prepare(`SELECT 1 AS live WHERE ${guard.sql}`).bind(...guard.values).first();
        if (!live)
            throw new AdmissionError('forbidden', 'The connection is not yours or is no longer connected');
        return [guard];
    }
    async function references(ctx: RequestContext, d: EntityDescriptor, values: Record<string, CellValue>, recordId: string,verified?:ReadonlyMap<string,readonly SqlPredicate[]>,pending?:readonly Ref[]): Promise<SqlPredicate[]> { const guards: SqlPredicate[] = []; for (const [id, value] of Object.entries(values)) {
        const f = d.fields.get(id)!.field;
        if (f.type === 'attachment' && value !== null) {
            if (!attachments && (value as AttachmentMember[]).some(member => 'fileId' in member))
                throw new AdmissionError('unconfigured', 'Attachment authorization port is required');
            for (const member of value as AttachmentMember[])
                if ('fileId' in member)
                    guards.push(...(verified?.get('file:'+member.fileId)??await attachments!.prepareLink(ctx, member.fileId, { appId: d.schema.appId, entityId: d.schema.id, recordId }, id)));
                else
                    guards.push(...await storeReferenceGuards(ctx, d, recordId, d.fields.get(id)!, member.reference,verified));
        }
        if (f.type !== 'relation' || value === null)
            continue;
        for (const ref of Array.isArray(value) ? value as Ref[] : [value as Ref]) {
            // Only the server's atomic create planner supplies these identities. Every
            // pending row still receives its own create permit and insert row check.
            if (pending?.some(item => item.appId === ref.appId && item.entityId === ref.entityId && item.recordId === ref.recordId)) continue;
            const target = registry.get(ref.appId, ref.entityId), scope = await policy.scope(ctx, { appId: ref.appId, entityId: ref.entityId, purpose: 'read' });
            if (!await reader.raw(ctx, scope, ref))
                throw new AdmissionError('validation', 'Referenced record is unavailable');
            guards.push(exists(target.table, and(scope.rowPredicate, ...scope.currentAuthorityGuards, eq(target.table, target.idColumn, ref.recordId))));
        }
    } return guards; }
    async function joins(d: EntityDescriptor, id: string, values: Record<string, CellValue>, creating: boolean): Promise<SqlMutation[]> {
        const mutations: SqlMutation[] = [];
        for (const [fieldId, s] of d.fields) {
            if (!s.join || !(fieldId in values) && !creating)
                continue;
            const value = validateCell(s.field, values[fieldId] ?? null);
            const members = value === null ? [] : value as (string | Ref | AttachmentMember)[];
            if (!creating) {
                const count = await db.prepare(`SELECT COUNT(*) AS n FROM ${identifier(s.join.table.tableId)} WHERE record_id=?`).bind(id).first<{
                    n: number;
                }>();
                mutations.push({ kind: 'delete', table: s.join.table, where: eq(s.join.table, 'record_id', id), expectedRows: count!.n });
            }
            for (const [position, v] of members.entries())
                mutations.push({ kind: 'insert', table: s.join.table, row: { id: createUlid(), record_id: id, value: typeof v === 'string' ? v : 'recordId' in v ? v.recordId : 'reference' in v ? referenceValue(v.reference) : v.fileId, position } });
        }
        return mutations;
    }
    function writable(scope: PolicyScope, values: Record<string, CellValue>) { for (const field of Object.keys(values))
        if (!scope.writableFieldIds.includes(field))
            throw new AdmissionError('forbidden', 'A changed field is not writable'); }
    function normalizeValues(d:EntityDescriptor,values:Record<string,CellValue>){return Object.fromEntries(Object.entries(values).map(([id,value])=>{const field=d.fields.get(id)?.field;if(!field)throw new AdmissionError('validation','Unknown field ID');return [id,validateCell(field,value)]}))}
    async function internalChange(ctx: RequestContext, scope: PolicyScope, request: {
        ref: Ref;
        expectedVersion: number;
        changes: Record<string, CellValue>;
    }, operation: 'patch' | 'transition' | 'delete' | 'undo' = 'patch',verified?:ReadonlyMap<string,readonly SqlPredicate[]>): Promise<PreparedRecordChange> {
        const d = registry.get(request.ref.appId, request.ref.entityId);
        writable(scope, request.changes);
        request={...request,changes:normalizeValues(d,request.changes)};
        const raw = await reader.raw(ctx, scope, request.ref);
        if (!raw)
            throw new AdmissionError('not_found', 'Record not found');
        if (raw[d.versionColumn] !== request.expectedVersion)
            throw new AdmissionError('version_conflict', 'Record version changed', Number(raw[d.versionColumn]));
        const complete = { ...await storedValidationValues(db, d, raw), ...request.changes };
        if (operation !== 'delete') assertRecordValidation(d.schema, complete);
        const before = await reader.render(ctx, scope, d, raw);
        const row = { ...raw, ...encodeValues(d, request.changes, false), [d.versionColumn]: request.expectedVersion + 1, [d.updatedColumn]: new Date().toISOString() };
        const next = await reader.render(ctx, scope, d, row);
        for (const [id, v] of Object.entries(request.changes))
            if (d.fields.get(id)?.join)
                next.fields[id] = scope.readableFieldIds.includes(id) ? { state: 'value', value: validateCell(d.fields.get(id)!.field, v) } : { state: 'redacted', reason: 'policy' };
        const projection = Object.keys(row).map(c => `json_extract(payload,'$.${c}') AS ${identifier(c)}`).join(',');
        const postScope = trustedPredicate(`EXISTS(SELECT 1 FROM (SELECT ${projection} FROM (SELECT ? AS payload)) AS ${identifier(d.table.tableId)} WHERE ${scope.rowPredicate.sql})`, [canonical(row), ...scope.rowPredicate.values]);
        const guards = [postScope, ...await invariant(ctx, d, operation, request.ref, request.expectedVersion, request.changes, raw), schemaGuard(d), ...scope.currentAuthorityGuards, exists(d.table, and(scope.rowPredicate, eq(d.table, d.idColumn, request.ref.recordId), eq(d.table, d.versionColumn, request.expectedVersion))), ...await references(ctx, d, request.changes, request.ref.recordId,verified), ...await uniqueValidationGuards(db,d,complete,row,request.ref.recordId)];
        const set = { ...encodeValues(d, request.changes, false), [d.versionColumn]: request.expectedVersion + 1, [d.updatedColumn]: row[d.updatedColumn] as string };
        const mutations: SqlMutation[] = [{ kind: 'update', table: d.table, set, where: and(eq(d.table, d.idColumn, request.ref.recordId), eq(d.table, d.versionColumn, request.expectedVersion)), expectedRows: 1 }, ...await joins(d, request.ref.recordId, request.changes, false)];
        if (!effects)
            throw new AdmissionError('unconfigured', 'Canonical record invalidation port is required');
        const dependent = await effects(ctx, { before: { ref: request.ref, version: request.expectedVersion }, after: operation === 'delete' ? null : { ref: request.ref, version: request.expectedVersion + 1 } });
        guards.push(...dependent.guards);
        mutations.push(...dependent.mutations);
        return { guards, mutations, next, audit: [{ action: 'record.patch', subject: request.ref, changes: Object.keys(request.changes).map(fieldId => ({ fieldId, before: before.fields[fieldId] ?? { state: 'redacted', reason: 'policy' }, after: next.fields[fieldId]! })), sourceIds: [], personalContentRefs: [] }] };
    }
    async function prepareCreate(ctx: RequestContext, scope: PolicyScope, values: Record<string, CellValue>, id = createUlid(), batch?:{pending:readonly Ref[];verified?:ReadonlyMap<string,readonly SqlPredicate[]>}): Promise<PreparedRecordChange> {
        const d = registry.get(scope.appId, scope.entityId);
        values = { ...Object.fromEntries(d.schema.fields.filter(field => field.defaultValue !== undefined && scope.writableFieldIds.includes(field.id) && !field.readOnly && !Object.hasOwn(values,field.id)).map(field => [field.id,structuredClone(field.defaultValue!)])), ...values };
        writable(scope, values);
        values=normalizeValues(d,values);
        assertRecordValidation(d.schema, values);
        const now = new Date().toISOString(), row = { ...encodeValues(d, values, true), [d.idColumn]: id, [d.versionColumn]: 1, [d.createdColumn]: now, [d.updatedColumn]: now, [d.lifecycleColumn]: d.schema.lifecycle.initial, [d.schemaVersionColumn]: d.schema.version };
        const next = await reader.render(ctx, scope, d, row);
        for (const [fieldId, s] of d.fields)
            if (s.join)
                next.fields[fieldId] = scope.readableFieldIds.includes(fieldId) ? { state: 'value', value: values[fieldId] ?? null } : { state: 'redacted', reason: 'policy' };
        for (const [fieldId,value] of Object.entries(values)) {
            const field=d.fields.get(fieldId)!.field;
            if(field.type!=='relation'||!batch?.pending.length||!scope.readableFieldIds.includes(fieldId)||!scope.discoverableRelations.includes(fieldId))continue;
            const members=value===null?[]:Array.isArray(value)?value as Ref[]:[value as Ref];
            if(members.some(ref=>batch.pending.some(p=>p.appId===ref.appId&&p.entityId===ref.entityId&&p.recordId===ref.recordId)))next.fields[fieldId]={state:'value',value};
        }
        return { guards: [...await recordCapacityGuard(db,d),...await invariant(ctx, d, 'create', next.ref, 0, values, null), schemaGuard(d), ...scope.currentAuthorityGuards, ...await references(ctx, d, values, id,batch?.verified,batch?.pending), ...await uniqueValidationGuards(db,d,values,row,id)], mutations: [{ kind: 'insert', table: d.table, row, check: scope.rowPredicate }, ...await joins(d, id, values, true)], next, audit: [{ action: 'record.create', subject: next.ref, changes: Object.keys(values).map(fieldId => ({ fieldId, before: { state: 'value', value: null }, after: next.fields[fieldId]! })), sourceIds: [], personalContentRefs: [] }] };
    }
    async function prepareTransition(ctx: RequestContext, scope: PolicyScope, ref: Ref, expectedVersion: number, action: string): Promise<PreparedRecordChange> { const d = registry.get(ref.appId, ref.entityId), raw = await reader.raw(ctx, scope, ref); if (!raw)
        throw new AdmissionError('not_found', 'Record not found'); const transition = d.schema.lifecycle.transitions.find(t => t.action === action && t.from.includes(String(raw[d.lifecycleColumn]))); if (!transition)
        throw new AdmissionError('invalid_transition', 'Lifecycle transition is not available'); if (d.writePolicy?.transitions && !d.writePolicy.transitions.includes(action))
        throw new AdmissionError('forbidden', 'Lifecycle requires a typed domain action'); const change = await internalChange(ctx, scope, { ref, expectedVersion, changes: {} }, 'transition'); change.guards.push(...await invariant(ctx, d, 'transition', ref, expectedVersion, {}, raw, transition.to)); const mutation = change.mutations[0]; if (mutation.kind !== 'update')
        throw new Error('Invalid transition plan'); mutation.set = { ...mutation.set, [d.lifecycleColumn]: transition.to }; change.next.lifecycle = transition.to; change.audit[0]!.action = action; return change; }
    async function prepareDelete(ctx: RequestContext, scope: PolicyScope, ref: Ref, expectedVersion: number, path = new Set<string>(), groupId=createUlid()): Promise<PreparedRecordChange> {
        const key = ref.appId + ':' + ref.entityId + ':' + ref.recordId;
        if (path.size >= 64 || path.has(key))
            throw new AdmissionError('invalid_transition', 'Deletion dependency cycle or depth limit');
        const nextPath = new Set(path).add(key);
        const d = registry.get(ref.appId, ref.entityId), change = await internalChange(ctx, scope, { ref, expectedVersion, changes: {} }, 'delete'), impact = await deletionImpact(ctx, ref);
        change.guards.push(...impact.guards);
        const dependents: SqlMutation[] = [];
        const restoreLinks:{ref:Ref;fieldId:string;version:number;value:CellValue}[]=[];
        const handled = new Set<string>();
        for (const link of impact.references) {
            const targetKey = link.ref.appId + ':' + link.ref.entityId + ':' + link.ref.recordId;
            if (nextPath.has(targetKey) || handled.has(targetKey))
                continue;
            if (link.effect === 'restrict')
                throw new AdmissionError('invalid_transition', 'Record has a restricted reference');
            const targetScope = await policy.scope(ctx, { appId: link.ref.appId, entityId: link.ref.entityId, purpose: 'read' });
            let prepared: PreparedRecordChange;
            if (link.effect === 'cascade') {
                handled.add(targetKey);
                prepared = await prepareDelete(ctx, targetScope, link.ref, link.version, nextPath,groupId);
            }
            else {
                const current = await reader.record(ctx, targetScope, link.ref), old = current.fields[link.fieldId];
                if (old?.state !== 'value')
                    throw new AdmissionError('forbidden', 'Linked field is unavailable');
                restoreLinks.push({ref:link.ref,fieldId:link.fieldId,version:link.version+1,value:old.value});
                const value = Array.isArray(old.value) ? (old.value as Ref[]).filter(v => v.recordId !== ref.recordId) : null;
                prepared = await prepareChange(ctx, targetScope, { ref: link.ref, expectedVersion: link.version, changes: { [link.fieldId]: value } });
            }
            const action = link.effect === 'cascade' ? 'record.delete' : 'record.patch', permit = await policy.authorize(ctx, { appId: link.ref.appId, action, expected: [{ ref: link.ref, version: link.version }], fieldIds: link.effect === 'cascade' ? [] : [link.fieldId], cost: [], inputHash: await canonicalHash({ action, ref: link.ref, source: ref }) });
            change.guards.push(...prepared.guards, ...permit.guards);
            dependents.push(...prepared.mutations, ...permit.reservationMutations);
            change.audit.push(...prepared.audit);
        }
        const own=change.mutations[0]!;if(own.kind!=='update')throw new Error('Record trash requires a versioned update');own.set={...own.set,[d.lifecycleColumn]:'deleted'};
        change.mutations = [...change.mutations, ...dependents, {kind:'insert',table:trashTable,row:{app_id:ref.appId,entity_id:ref.entityId,record_id:ref.recordId,group_id:groupId,actor_id:ctx.principal.id,deleted_at:Date.parse(ctx.now),expires_at:Date.parse(ctx.now)+trashLifetime,record_version:expectedVersion+1,schema_version:d.schema.version,prior_lifecycle:change.next.lifecycle,links_json:canonical(restoreLinks),purge_state:'held'}}];
        change.audit[0]!.action = 'record.delete';
        change.next.lifecycle = 'deleted';
        return change;
    }
    async function prepareRestoreLifecycle(ctx: RequestContext, scope: PolicyScope, ref: Ref, expectedVersion: number, lifecycle: string): Promise<PreparedRecordChange> { const d = registry.get(ref.appId, ref.entityId); if (!d.schema.lifecycle.states.includes(lifecycle))
        throw new AdmissionError('schema_conflict', 'Prior lifecycle is unavailable'); const change = await internalChange(ctx, scope, { ref, expectedVersion, changes: {} }, 'undo'); change.guards.push(...await invariant(ctx, d, 'undo', ref, expectedVersion, {}, await reader.raw(ctx, scope, ref), lifecycle)); const m = change.mutations[0]!; if (m.kind !== 'update')
        throw new Error('Expected update'); m.set = { ...m.set, [d.lifecycleColumn]: lifecycle }; change.next.lifecycle = lifecycle; change.audit[0]!.action = 'record.undo'; return change; }
    const prepareChange = (ctx: RequestContext, scope: PolicyScope, request: {
        ref: Ref;
        expectedVersion: number;
        changes: Record<string, CellValue>;
    },verified?:ReadonlyMap<string,readonly SqlPredicate[]>) => internalChange(ctx, scope, request, 'patch',verified);
    return { prepareChange, prepareCreate, prepareTransition, prepareDelete, prepareRestoreLifecycle, deletionImpact };
}
