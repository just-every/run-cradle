import { assertCurrentScopeAuthority } from '../authority/guards.server';
import type { Ref, Cell, Page } from '../../contracts/primitives';
import type { RequestContext, PolicyPort, PolicyScope } from '../authority/ports';
import type { SqlMutation } from './ports';
import { loadProvenance } from './provenance.server';
import { auditTable, commandTable, eventTable, outboxTable,provenanceTable } from './tables.server';
import { eq } from './sql.server';
import { createCursorCodec } from '../records/cursor.server';
import { AdmissionError } from './errors';
import { canonical } from './canonical';
export type AuditEntry = {
    id: string;
    commandId: string;
    actor: {
        id: string;
        kind: string;
    };
    action: string;
    subject: Ref | null;
    changes: {
        fieldId: string;
        before: Cell;
        after: Cell;
    }[];
    sourceIds: string[];
    personalContentRefs: string[];
    createdAt: string;
};
type Row = {
    id: string;
    command_id: string;
    actor_id: string;
    actor_kind: string;
    app_id: string;
    action: string;
    subject_json: string;
    changes_json: string;
    source_ids_json: string;
    personal_refs_json: string;
    created_at: string;
};
export function createAuditReader(db: D1Database, policy: PolicyPort, discover: (ctx: RequestContext, ref: Ref) => Promise<void>, options: {
    cursorSecret: string;
    projectCell(ctx: RequestContext, scope: PolicyScope, ref: Ref, fieldId: string, cell: Cell): Promise<Cell>;
    projectSourceIds(ctx: RequestContext, ids: string[]): Promise<string[]>;
}) {
    const codec = createCursorCodec(options.cursorSecret);
    return {
        async subject(ctx: RequestContext, ref: Ref, limit = 200, cursor?: string): Promise<Page<AuditEntry>> {
            if (!Number.isInteger(limit) || limit < 1 || limit > 200)
                throw new Error('Invalid audit limit');
            await discover(ctx, ref);
            const scope = await policy.scope(ctx, { appId: ref.appId, entityId: ref.entityId, purpose: 'read' });
            const rows = await db.prepare('SELECT * FROM admission_audit WHERE app_id=? AND subject_json=? ORDER BY created_at,id').bind(ref.appId, canonical(ref)).all<Row>();
            const visible = rows.results.flatMap(row => { const changes = JSON.parse(row.changes_json) as AuditEntry['changes']; const projected = changes.filter(c => scope.readableFieldIds.includes(c.fieldId)); return changes.length && !projected.length ? [] : [{ row, changes: projected }]; });
            const revision = (await db.prepare('SELECT COALESCE(MAX(rowid),0) AS revision FROM command_admissions').first<{
                revision: number;
            }>())!.revision;
            const binding = await codec.binding({ actor: ctx.principal.id, epoch: ctx.principal.authenticationEpoch, ref, policy: scope.policyVersion, fields: scope.readableFieldIds });
            let offset = 0;
            if (cursor) {
                const parsed = await codec.decode(cursor);
                if (parsed.binding !== binding || parsed.revision !== revision)
                    throw new AdmissionError('stale_cursor', 'Audit or access changed');
                offset = parsed.offset;
            }
            const items = await Promise.all(visible.slice(offset, offset + limit).map(async ({ row, changes }) => ({ id: row.id, commandId: row.command_id, actor: { id: row.actor_id, kind: row.actor_kind }, action: row.action, subject: ref, changes: await Promise.all(changes.map(async change => ({ fieldId: change.fieldId, before: await options.projectCell(ctx, scope, ref, change.fieldId, change.before), after: await options.projectCell(ctx, scope, ref, change.fieldId, change.after) }))), sourceIds: await options.projectSourceIds(ctx, JSON.parse(row.source_ids_json)), personalContentRefs: [], createdAt: row.created_at })));
            await assertCurrentScopeAuthority(db, ctx, scope);
            await discover(ctx, ref);
            return { items, nextCursor: offset + limit < visible.length ? await codec.encode({ binding, revision, offset: offset + limit }) : null, total: { kind: visible.length > 10000 ? 'at_least' : 'exact', value: Math.min(visible.length, 10000) }, evaluatedAt: new Date().toISOString() };
        },
        async prepareRedaction(input: {
            subjectRefs: Ref[];
            personalContentRefs: string[];
        }): Promise<SqlMutation[]> {
            const rows = await db.prepare('SELECT * FROM admission_audit').all<Row>();
            const subjects = new Set(input.subjectRefs.map(canonical)), personal = new Set(input.personalContentRefs);
            const affected = rows.results.filter(r => subjects.has(r.subject_json) || (JSON.parse(r.personal_refs_json) as string[]).some(id => personal.has(id)));
            const commands = new Set(affected.map(r => r.command_id));
            const contains = (value: unknown): boolean => { if (typeof value === 'string')
                return personal.has(value); if (!value || typeof value !== 'object')
                return false; if (!Array.isArray(value) && 'appId' in value && 'entityId' in value && 'recordId' in value && subjects.has(canonical({ appId: value.appId, entityId: value.entityId, recordId: value.recordId })))
                return true; return Object.values(value).some(contains); };
            const storedCommands = await db.prepare('SELECT command_id,result_json,access_json FROM command_admissions').all<{
                command_id: string;
                result_json: string;
                access_json: string;
            }>();
            for (const row of storedCommands.results)
                if (contains(JSON.parse(row.result_json)) || contains(await loadProvenance(db,row.command_id,row.access_json)))
                    commands.add(row.command_id);
            for(const table of ['admission_events','admission_outbox']){const payload=table==='admission_events'?'payload_json':'input_json';const extra=await db.prepare(`SELECT command_id,subject_json,${payload} AS body FROM ${table}`).all<{command_id:string;subject_json:string;body:string}>();for(const row of extra.results)if(contains(JSON.parse(row.subject_json))||contains(JSON.parse(row.body)))commands.add(row.command_id);}
            const mutations: SqlMutation[] = affected.map(r => ({ kind: 'update', table: auditTable, set: { subject_json: 'null', changes_json: canonical((JSON.parse(r.changes_json) as AuditEntry['changes']).map(c => ({ fieldId: c.fieldId, before: { state: 'redacted', reason: 'erased' }, after: { state: 'redacted', reason: 'erased' } }))), source_ids_json: '[]', personal_refs_json: '[]' }, where: eq(auditTable, 'id', r.id), expectedRows: 1 }));
            for (const commandId of commands) {
                const command = await db.prepare('SELECT result_json,access_json FROM command_admissions WHERE command_id=?').bind(commandId).first<{
                    result_json: string;access_json:string;
                }>();
                if (command) {
                    const result = JSON.parse(command.result_json),provenance=await loadProvenance(db,commandId,command.access_json);if(JSON.parse(command.access_json).format==='segmented-v1')mutations.push({kind:'delete',table:provenanceTable,where:eq(provenanceTable,'command_id',commandId),expectedRows:JSON.parse(command.access_json).segments.length});
                    mutations.push({ kind: 'update', table: commandTable, set: { result_json: canonical({ ...result, value: null, changed: [] }),access_json:canonical({...provenance,subjects:[]}) }, where: eq(commandTable, 'command_id', commandId), expectedRows: 1 });
                }
                const events = await db.prepare('SELECT id FROM admission_events WHERE command_id=?').bind(commandId).all<{
                    id: string;
                }>();
                for (const event of events.results)
                    mutations.push({ kind: 'update', table: eventTable, set: { subject_json: 'null', payload_json: 'null' }, where: eq(eventTable, 'id', event.id), expectedRows: 1 });
                const outbox = await db.prepare('SELECT id,state FROM admission_outbox WHERE command_id=?').bind(commandId).all<{
                    id: string;
                    state: string;
                }>();
                for (const entry of outbox.results)
                    mutations.push({ kind: 'update', table: outboxTable, set: { subject_json: 'null', input_json: 'null', ...(entry.state === 'pending' ? { state: 'cancelled' } : {}) }, where: eq(outboxTable, 'id', entry.id), expectedRows: 1 });
            }
            return mutations;
        },
        async verifyRedaction(input:{subjectRefs:Ref[];personalContentRefs:string[]}):Promise<boolean>{return (await this.prepareRedaction(input)).length===0;}

    };
}
