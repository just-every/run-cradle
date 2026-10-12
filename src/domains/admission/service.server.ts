import type { RequestContext } from '../authority/ports';
import type { AdmissionPort, AdmissionPlan, AdmissionReceipt } from './ports';
import type { CommandResult, CommandStatus, Json, Ref } from '../../contracts/primitives';
import { compileAdmission } from './compiler.server';
import { loadProvenance } from './provenance.server';
import { AdmissionError } from './errors';
type Stored = {
    command_id: string;
    batch_nonce: string;
    actor_id: string;
    actor_kind: string;
    app_id: string;
    action: string;
    input_hash: string;
    state: string;
    result_json: string;
    access_json: string;
    updated_at: string;
};
export type ReplayProvenance = {
    policyVersion: number;
    grantId: string | null;
    grantVersion: number | null;
    subjects: {
        ref: Ref;
        fieldIds: string[];
    }[];
};
export type ExecutionStatus = Pick<CommandStatus, 'state' | 'runId' | 'receiptIds' | 'firstPossibleEffectAt' | 'failure' | 'updatedAt'>;
export type AdmissionAccess = {
    authorizeReplay(ctx: RequestContext, command: {
        appId: string;
        action: string;
        actorId: string;
        commandId: string;
        result: unknown;
        provenance: ReplayProvenance;
    }): Promise<void>;
    executionStatus?: (ctx: RequestContext, commandId: string) => Promise<ExecutionStatus | null>;
    additionalGuards?: (ctx:RequestContext) => import('./ports').SqlPredicate[];
    captureRecordEvents?: boolean;
};
export function createAdmissionService(db: D1Database, access: AdmissionAccess): AdmissionPort {
    const read = (id: string) => db.prepare('SELECT * FROM command_admissions WHERE command_id=?').bind(id).first<Stored>();
    async function visible(ctx: RequestContext, row: Stored) { await access.authorizeReplay(ctx, { appId: row.app_id, action: row.action, actorId: row.actor_id, commandId: row.command_id, result: JSON.parse(row.result_json), provenance: await loadProvenance(db,row.command_id,row.access_json) }); }
    async function replay<T>(ctx: RequestContext, id: string, action: string, appId: string, hash: string): Promise<AdmissionReceipt<T> | null> { const row = await read(id); if (!row)
        return null; await visible(ctx, row); if (row.actor_id !== ctx.principal.id || row.actor_kind !== ctx.principal.kind || row.app_id !== appId || row.action !== action || row.input_hash !== hash)
        throw new AdmissionError('idempotency_conflict', 'This command ID belongs to a different canonical request.'); if (row.state !== 'committed')
        throw new AdmissionError('internal', 'Command is not committed'); return { replay: true, result: JSON.parse(row.result_json), consistencyToken: row.command_id }; }
    return {
        replay,
        async commit<T>(ctx: RequestContext, plan: AdmissionPlan<T>): Promise<AdmissionReceipt<T>> {
            const prior = await replay<T>(ctx, plan.commandId, plan.action, plan.appId, plan.canonicalInputHash);
            if (prior)
                return prior;
            const compiled = compileAdmission(ctx, { ...plan, guards: [...plan.guards, ...(access.additionalGuards?.(ctx) ?? [])] }, {captureRecordEvents:access.captureRecordEvents});
            try {
                await db.batch(compiled.statements.map(s => db.prepare(s.sql).bind(...s.values)));
            }
            catch (error) {
                if (String(error).includes('CHECK constraint failed: ok=1'))
                    throw new AdmissionError('version_conflict', 'A prepared mutation no longer matches current state. Read and prepare again.');
                if (/UNIQUE constraint|FOREIGN KEY constraint|NOT NULL constraint|CHECK constraint/.test(String(error)))
                    throw new AdmissionError('validation', 'A required, unique or referenced value is no longer valid.');
                throw error;
            }
            const row = await read(plan.commandId);
            if (!row)
                throw new AdmissionError('version_conflict', 'Current record, authority or budget guards rejected this command. Refresh before submitting.');
            if (row.batch_nonce !== compiled.nonce)
                await visible(ctx, row);
            if (row.actor_id !== ctx.principal.id || row.actor_kind !== ctx.principal.kind || row.app_id !== plan.appId || row.action !== plan.action || row.input_hash !== plan.canonicalInputHash)
                throw new AdmissionError('idempotency_conflict', 'This command ID belongs to a different canonical request.');
            if (row.state !== 'committed')
                throw new AdmissionError('internal', 'Command did not reach committed state.');
            return { replay: row.batch_nonce !== compiled.nonce, result: JSON.parse(row.result_json) as CommandResult<T>, consistencyToken: row.command_id };
        },
        async status(ctx: RequestContext, id: string): Promise<CommandStatus> {
            if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(id))
                throw new AdmissionError('validation', 'Invalid command ID');
            const row = await read(id);
            if (!row)
                throw new AdmissionError('not_found', 'Command not found');
            await visible(ctx, row);
            const stored = JSON.parse(row.result_json) as CommandResult<Json>;
            const pending = await db.prepare('SELECT COUNT(*) AS n FROM admission_outbox WHERE command_id=?').bind(id).first<{
                n: number;
            }>();
            if (pending!.n && !access.executionStatus)
                throw new AdmissionError('unconfigured', 'Execution status port is required for this command');
            const execution = await access.executionStatus?.(ctx, id);
            return { commandId: id, action: row.action, state: pending!.n ? 'accepted' : 'committed', result: stored.state === 'committed' ? stored.value : null, failure: null, runId: null, receiptIds: [], firstPossibleEffectAt: null, updatedAt: row.updated_at, ...execution };
        }
    };
}
