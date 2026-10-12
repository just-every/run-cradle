import type { OutboxCommand, SqlMutation } from './ports';
import { outboxTable } from './tables.server';
import { and, eq } from './sql.server';
export type OutboxEntry = OutboxCommand & {
    id: string;
    commandId: string;
    appId: string;
    state: 'pending' | 'dispatched' | 'cancelled';
    createdAt: string;
    updatedAt: string;
};
type Row = {
    id: string;
    command_id: string;
    app_id: string;
    action: string;
    version: number;
    input_json: string;
    not_before: string;
    grant_id: string | null;
    subject_json: string;
    source_release_id: string;
    cause_run_ids_json: string;
    state: OutboxEntry['state'];
    created_at: string;
    updated_at: string;
};
function decode(r: Row): OutboxEntry { return { id: r.id, commandId: r.command_id, appId: r.app_id, action: r.action, version: r.version, input: JSON.parse(r.input_json), notBefore: r.not_before, grantId: r.grant_id, subject: JSON.parse(r.subject_json), sourceReleaseId: r.source_release_id, causeRunIds: JSON.parse(r.cause_run_ids_json), state: r.state, createdAt: r.created_at, updatedAt: r.updated_at }; }
/** Internal execution service only. Its dispatch reauthorizes the original action before any effect. */
export function createOutboxReader(db: D1Database) {
    return {
        async due(now: string, limit = 100): Promise<OutboxEntry[]> { if (!Number.isInteger(limit) || limit < 1 || limit > 200)
            throw new Error('Invalid outbox limit'); const r = await db.prepare("SELECT * FROM admission_outbox WHERE state='pending' AND not_before<=? ORDER BY not_before,id LIMIT ?").bind(now, limit).all<Row>(); return r.results.map(decode); },
        async get(id: string): Promise<OutboxEntry | null> { const row = await db.prepare('SELECT * FROM admission_outbox WHERE id=?').bind(id).first<Row>(); return row ? decode(row) : null; }
    };
}
export function settleOutbox(id: string, state: 'dispatched' | 'cancelled', now: string): SqlMutation { return { kind: 'update', table: outboxTable, set: { state, updated_at: now }, where: and(eq(outboxTable, 'id', id), eq(outboxTable, 'state', 'pending')), expectedRows: 1 }; }
