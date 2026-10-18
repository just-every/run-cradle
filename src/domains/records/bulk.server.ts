import type { CellValue, CommandInput, Ref, RevisionRef } from '../../contracts/primitives';
import type { RequestContext, PolicyPort } from '../authority/ports';
import type { Query } from './contracts';
import type { AdmissionPlan, SqlMutation } from '../admission/ports';
import { createUlid } from '../../core/shared/ids';
import { canonical, canonicalHash } from '../admission/canonical';
import { registerTable, eq, and } from '../admission/sql.server';
import { AdmissionError } from '../admission/errors';
import { createRecordReader } from './query.server';
import type { PreparedRecordChange } from './ports';
import { createRecordWriter } from './change.server';
import { createCursorCodec } from './cursor.server';
export type BulkInput = {
    appId: string;
    entityId: string;
    selection: {
        ids: string[];
    } | {
        query: Query;
    };
    change: {
        fieldId: string;
        value: CellValue;
    } | {
        transition: string;
    };
};
type Inverse = {
    ref: Ref;
    version: number;
    values: Record<string, CellValue>;
    lifecycle?: string;
};
const previews = registerTable('record_previews', ['id', 'app_id', 'entity_id', 'actor_id', 'input_hash', 'input_json', 'expected_json', 'expires_at', 'state', 'created_at', 'updated_at']);
const undos = registerTable('record_undo', ['id', 'command_id', 'app_id', 'actor_id', 'inverse_json', 'expires_at', 'state', 'created_at', 'updated_at']);
export function createBulkService(db: D1Database, reader: ReturnType<typeof createRecordReader>, writer: ReturnType<typeof createRecordWriter>, policy: PolicyPort, secret: string) {
    const codec = createCursorCodec(secret);
    async function authorize(ctx: RequestContext, commandId: string, appId: string, action: string, input: unknown, expected: RevisionRef[], wireExpected: RevisionRef[] = expected, controlEpoch?: number, fieldIds: string[] = [], transition?: string) { const hash = await canonicalHash({ action, input, expected: wireExpected, controlEpoch: controlEpoch ?? null }); const permit = await policy.authorize(ctx, { appId, action, expected, cost: [], inputHash: hash, commandId, fieldIds }); if(transition){const p=await policy.authorize(ctx,{appId,action:transition,transition,expected,cost:[],inputHash:hash,commandId,fieldIds});return {hash,permit:{...permit,guards:[...permit.guards,...p.guards],reservationMutations:[...permit.reservationMutations,...p.reservationMutations]}};} return { hash, permit }; }
    return {
        async replayApp(ctx: RequestContext, id: string, kind: 'preview' | 'undo') { const table = kind === 'preview' ? 'record_previews' : 'record_undo'; const row = await db.prepare(`SELECT app_id,actor_id FROM ${table} WHERE id=?`).bind(id).first<{
            app_id: string;
            actor_id: string;
        }>(); if (!row || row.actor_id !== ctx.principal.id)
            throw new AdmissionError('not_found', 'Command resource not found'); return row.app_id; },
        async preview(ctx: RequestContext, command: CommandInput<BulkInput>): Promise<AdmissionPlan<unknown>> {
            const input = command.input, scope = await policy.scope(ctx, { appId: input.appId, entityId: input.entityId, purpose: 'read' });
            let refs: Ref[] = [];
            if ('ids' in input.selection) {
                if (new Set(input.selection.ids).size !== input.selection.ids.length || input.selection.ids.length > 500)
                    throw new AdmissionError('capacity_limit', 'Bulk selection supports at most 500 distinct records');
                refs = input.selection.ids.map(recordId => ({ appId: input.appId, entityId: input.entityId, recordId }));
            }
            else {
                let cursor: string | undefined;
                do {
                    const page = await reader.query(ctx, scope, { ...input.selection.query, cursor, limit: 200 });
                    refs.push(...page.items.map(r => r.ref));
                    if (refs.length > 500)
                        throw new AdmissionError('capacity_limit', 'Bulk selection exceeds 500 records');
                    cursor = page.nextCursor ?? undefined;
                } while (cursor);
            }
            if (!refs.length)
                throw new AdmissionError('validation', 'Select at least one record');
            const expected: RevisionRef[] = [], changes: unknown[] = [];
            await reader.withRows(ctx, scope, refs, async () => { for (const ref of refs) {
                const record = await reader.record(ctx, scope, ref);
                expected.push({ ref, version: record.version });
                const change = 'fieldId' in input.change ? await writer.prepareChange(ctx, scope, { ref, expectedVersion: record.version, changes: { [input.change.fieldId]: input.change.value } }) : await writer.prepareTransition(ctx, scope, ref, record.version, input.change.transition);
                changes.push({ row: changes.length + 1, ref, fields: change.audit.flatMap(a => a.changes) });
            } });
            const id = createUlid(), now = new Date().toISOString(), expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
            const stored = { ...input, selection: { ids: refs.map(r => r.recordId) } };
            const hash = await canonicalHash(stored), token = await codec.encode({ binding: await canonicalHash({ id, hash, actor: ctx.principal.id }), revision: 1, offset: 0 });
            const auth = await authorize(ctx, command.commandId, input.appId, 'record.bulk-preview', input, expected, command.expected, command.controlEpoch, 'fieldId' in input.change ? [input.change.fieldId] : [], 'transition' in input.change ? input.change.transition : undefined);
            return { commandId: command.commandId, action: 'record.bulk-preview', appId: input.appId, canonicalInputHash: auth.hash, permit: auth.permit, guards: [...scope.currentAuthorityGuards], mutations: [{ kind: 'insert', table: previews, row: { id, app_id: input.appId, entity_id: input.entityId, actor_id: ctx.principal.id, input_hash: hash, input_json: canonical(stored), expected_json: canonical(expected), expires_at: expiresAt, state: 'valid', created_at: now, updated_at: now } }], audit: [], events: [], outbox: [], committedResult: { id, version: 1, createdAt: now, updatedAt: now, state: 'valid', token, expiresAt, creates: 0, updates: refs.length, unchanged: 0, changes, errors: [], expected, impact: { summary: `Update ${refs.length} records`, spend: [], commitments: [], affected: refs, accessChanges: [], egress: [], uncertainty: [] } } };
        },
        async commit(ctx: RequestContext, command: CommandInput<{
            previewId: string;
            token: string;
        }>): Promise<AdmissionPlan<unknown>> {
            const row = await db.prepare('SELECT * FROM record_previews WHERE id=?').bind(command.input.previewId).first<{
                id: string;
                app_id: string;
                entity_id: string;
                actor_id: string;
                input_hash: string;
                input_json: string;
                expected_json: string;
                expires_at: string;
                state: string;
            }>();
            if (!row || row.actor_id !== ctx.principal.id)
                throw new AdmissionError('not_found', 'Preview not found');
            if (row.state !== 'valid' || row.expires_at <= new Date().toISOString())
                throw new AdmissionError('stale_evidence', 'Preview expired or consumed');
            const token = await codec.decode(command.input.token);
            if (token.binding !== await canonicalHash({ id: row.id, hash: row.input_hash, actor: ctx.principal.id }))
                throw new AdmissionError('validation', 'Preview token mismatch');
            const input = JSON.parse(row.input_json) as BulkInput, expected = JSON.parse(row.expected_json) as RevisionRef[], scope = await policy.scope(ctx, { appId: row.app_id, entityId: row.entity_id, purpose: 'read' }), prepared: PreparedRecordChange[] = [], inverse: Inverse[] = [];
            await reader.withRows(ctx, scope, expected.map(e => e.ref), async () => { for (const e of expected) {
                const before = await reader.record(ctx, scope, e.ref);
                if ('fieldId' in input.change) {
                    const old = before.fields[input.change.fieldId];
                    if (old?.state !== 'value')
                        throw new AdmissionError('forbidden', 'Undo requires readable changed fields');
                    inverse.push({ ref: e.ref, version: e.version + 1, values: { [input.change.fieldId]: old.value } });
                    prepared.push(await writer.prepareChange(ctx, scope, { ref: e.ref, expectedVersion: e.version, changes: { [input.change.fieldId]: input.change.value } }));
                }
                else {
                    inverse.push({ ref: e.ref, version: e.version + 1, values: {}, lifecycle: before.lifecycle });
                    prepared.push(await writer.prepareTransition(ctx, scope, e.ref, e.version, input.change.transition));
                }
            } });
            const now = new Date().toISOString(), undoId = createUlid(), undoExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(), auth = await authorize(ctx, command.commandId, row.app_id, 'record.bulk-commit', command.input, expected, command.expected, command.controlEpoch, 'fieldId' in input.change ? [input.change.fieldId] : [], 'transition' in input.change ? input.change.transition : undefined);
            const changed = prepared.map(p => ({ ref: p.next.ref, version: p.next.version }));
            return { commandId: command.commandId, action: 'record.bulk-commit', appId: row.app_id, canonicalInputHash: auth.hash, permit: auth.permit, guards: prepared.flatMap(p => p.guards), mutations: [...prepared.flatMap(p => p.mutations), { kind: 'update', table: previews, set: { state: 'consumed', updated_at: now }, where: and(eq(previews, 'id', row.id), eq(previews, 'state', 'valid')), expectedRows: 1 }, { kind: 'insert', table: undos, row: { id: undoId, command_id: command.commandId, app_id: row.app_id, actor_id: ctx.principal.id, inverse_json: canonical(inverse), expires_at: undoExpiresAt, state: 'available', created_at: now, updated_at: now } }], audit: prepared.flatMap(p => p.audit), events: [{ name: 'records.bulk.changed', version: 1, subject: null, payload: { count: changed.length }, causeRunIds: [] }], outbox: [], changed, committedResult: { changed, undoId, undoExpiresAt, rows:prepared.map(p=>p.next), inverse:inverse.filter(item=>!item.lifecycle && 'fieldId' in input.change && canonical(item.values[input.change.fieldId])!==canonical(input.change.value)).map(item=>({recordId:item.ref.recordId,changes:item.values})) } };
        },
        async undo(ctx: RequestContext, command: CommandInput<{
            undoId: string;
        }>): Promise<AdmissionPlan<unknown>> {
            const row = await db.prepare('SELECT * FROM record_undo WHERE id=?').bind(command.input.undoId).first<{
                id: string;
                app_id: string;
                actor_id: string;
                inverse_json: string;
                expires_at: string;
                state: string;
            }>();
            if (!row || row.actor_id !== ctx.principal.id)
                throw new AdmissionError('not_found', 'Undo not found');
            if (row.state !== 'available' || row.expires_at <= new Date().toISOString())
                throw new AdmissionError('stale_evidence', 'Undo expired or consumed');
            const inverse = JSON.parse(row.inverse_json) as Inverse[], prepared:PreparedRecordChange[] = [];
            const groups=new Map<string,Inverse[]>();for(const item of inverse){const key=item.ref.appId+':'+item.ref.entityId;groups.set(key,[...(groups.get(key)??[]),item]);}
            for(const items of groups.values()){
                const first=items[0]!,scope=await policy.scope(ctx,{appId:first.ref.appId,entityId:first.ref.entityId,purpose:'read'});
                await reader.withRows(ctx,scope,items.map(item=>item.ref),async()=>{for(const item of items)prepared.push(item.lifecycle?await writer.prepareRestoreLifecycle(ctx,scope,item.ref,item.version,item.lifecycle):await writer.prepareChange(ctx,scope,{ref:item.ref,expectedVersion:item.version,changes:item.values}));});
            }
            const expected = inverse.map(i => ({ ref: i.ref, version: i.version })), auth = await authorize(ctx, command.commandId, row.app_id, 'record.undo', command.input, expected, command.expected, command.controlEpoch, [...new Set(inverse.flatMap(i=>Object.keys(i.values)))]), restored = prepared.map(p => ({ ref: p.next.ref, version: p.next.version }));
            return { commandId: command.commandId, action: 'record.undo', appId: row.app_id, canonicalInputHash: auth.hash, permit: auth.permit, guards: prepared.flatMap(p => p.guards), mutations: [...prepared.flatMap(p => p.mutations), { kind: 'update', table: undos, set: { state: 'consumed', updated_at: new Date().toISOString() }, where: and(eq(undos, 'id', row.id), eq(undos, 'state', 'available')), expectedRows: 1 }], audit: prepared.flatMap(p => p.audit), events: [], outbox: [], changed: restored, committedResult: { restored } };
        }
    };
}
