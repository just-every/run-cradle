import { bindExpression, mutationGroupKey, compileMutationGroup } from './batch.server';
import { createUlid } from '../../core/shared/ids';
import type { RequestContext } from '../authority/ports';
import type { CommandResult, RevisionRef } from '../../contracts/primitives';
import type { AdmissionPlan, SqlMutation, SqlScalar } from './ports';
import { and, identifier, validateMutation, textReplacement } from './sql.server';
import { encodeProvenance } from './provenance.server';
import { provenanceTable } from './tables.server';
import { resultSubjects } from './provenance';
import { AdmissionError } from './errors';
import { canonical } from './canonical';
import { auditTable, eventTable, outboxTable } from './tables.server';
export type Statement = {
    sql: string;
    values: SqlScalar[];
};
export type CompiledAdmission<T> = {
    nonce: string;
    statements: Statement[];
    result: CommandResult<T>;
};
/** Keep combined guards shallow without changing any predicate or its bindings. */
function balancedAnd(parts: readonly string[]): string {
    if (parts.length < 2) return parts[0] ?? '1';
    const middle = Math.floor(parts.length / 2);
    return `(${balancedAnd(parts.slice(0, middle))} AND ${balancedAnd(parts.slice(middle))})`;
}
export function compileAdmission<T>(ctx: RequestContext, plan: AdmissionPlan<T>, options:{captureRecordEvents?:boolean}={}): CompiledAdmission<T> {
    if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(plan.commandId) || !/^[a-f0-9]{64}$/.test(plan.canonicalInputHash))
        throw new Error('Invalid command identity');
    if (plan.permit.actor.id !== ctx.principal.id || plan.permit.actor.kind !== ctx.principal.kind || plan.permit.action !== plan.action || plan.permit.appId !== plan.appId)
        throw new Error('Permit identity mismatch');
    const now = new Date().toISOString();
    if (plan.permit.validUntil <= now)
        throw new Error('Permit expired');
    const nonce = crypto.randomUUID(), values: [
        string,
        string
    ] = [plan.commandId, nonce];
    const gate = `EXISTS(SELECT 1 FROM command_admissions WHERE command_id=? AND batch_nonce=? AND state='admitted')`;
    const guards = [...plan.permit.guards, ...plan.guards];
    const statements: Statement[] = [{ sql: 'PRAGMA defer_foreign_keys = ON', values: [] }];
    let sequence = 0;
    // Separate assertions keep 500-row commands below D1 statement/bind limits. All run in the same atomic batch.
    const uniqueGuards = [...new Map(guards.map(g => { and(g); return [canonical({ sql: g.sql, values: g.values.map(v => v instanceof Uint8Array ? { bytes: [...v] } : v) }), g]; })).values()];
    for (let offset = 0; offset < uniqueGuards.length;) {
        const current = uniqueGuards[offset]!;
        if (current.values.some(v => v instanceof Uint8Array)) {
            statements.push({ sql: `INSERT INTO admission_assertions(nonce,sequence,ok) SELECT ?,?,CASE WHEN (${current.sql}) THEN 1 ELSE 0 END WHERE NOT EXISTS(SELECT 1 FROM command_admissions WHERE command_id=?)`, values: [nonce, sequence++, ...current.values, plan.commandId] });
            offset++;
            continue;
        }
        const parts: string[] = [], bindings: SqlScalar[] = [];
        let length = 0, payloadBytes=2;
        while (offset < uniqueGuards.length) {
            const item = uniqueGuards[offset]!;
            if (item.values.some(v => v instanceof Uint8Array) || parts.length && length + item.sql.length > 24000)
                break;
            const bytes=new TextEncoder().encode(canonical(item.values)).byteLength;if(parts.length&&payloadBytes+bytes>700000)break;payloadBytes+=bytes;
            const base = bindings.length;
            parts.push('(' + bindExpression(item.sql, i => `json_extract(payload,'$[${base + i}]')`) + ')');
            bindings.push(...item.values);
            length += item.sql.length;
            offset++;
        }
        statements.push({ sql: `INSERT INTO admission_assertions(nonce,sequence,ok) SELECT ?,?,CASE WHEN ${balancedAnd(parts)} THEN 1 ELSE 0 END FROM (SELECT ? AS payload) WHERE NOT EXISTS(SELECT 1 FROM command_admissions WHERE command_id=?)`, values: [nonce, sequence++, canonical(bindings), plan.commandId] });
    }
    statements.push({ sql: `INSERT INTO admission_assertions(nonce,sequence,ok) SELECT ?,?,CASE WHEN strftime('%Y-%m-%dT%H:%M:%fZ','now')<? THEN 1 ELSE 0 END WHERE NOT EXISTS(SELECT 1 FROM command_admissions WHERE command_id=?)`, values: [nonce, sequence++, plan.permit.validUntil, plan.commandId] });
    const provenance=encodeProvenance({policyVersion:plan.permit.policyVersion,grantId:plan.permit.grantId,grantVersion:plan.permit.grantVersion,subjects:resultSubjects(plan.committedResult,plan.audit,plan.accessSubjects)});
    statements.push({ sql: `INSERT INTO command_admissions(command_id,batch_nonce,actor_id,actor_kind,app_id,action,input_hash,state,access_json,created_at,updated_at) SELECT ?,?,?,?,?,?,?,'admitted',?,?,? WHERE NOT EXISTS(SELECT 1 FROM command_admissions WHERE command_id=?)`, values: [plan.commandId, nonce, ctx.principal.id, ctx.principal.kind, plan.appId, plan.action, plan.canonicalInputHash, provenance.header, now, now, plan.commandId] });
    if(options.captureRecordEvents)statements.push({sql:`INSERT INTO record_automation_context(singleton,command_id,app_id,cause_run_ids_json) SELECT 1,?,?,? WHERE ${gate}`,
      values:[plan.commandId,plan.appId,canonical(ctx.causeRunIds??[]),...values]});
    const append = (m: SqlMutation) => {
        validateMutation(m);
        const table = identifier(m.table.tableId);
        if (m.kind === 'insert') {
            const cols = Object.keys(m.row);
            if (!cols.length)
                throw new Error('Empty insert');
            if (cols.length > 60 && !Object.values(m.row).some(v => v instanceof Uint8Array)) {
                const projection = cols.map(c => `json_extract(payload,'$.${c}') AS ${identifier(c)}`).join(',');
                statements.push({ sql: `INSERT INTO ${table}(${cols.map(identifier).join(',')}) SELECT ${cols.map(identifier).join(',')} FROM (SELECT ${projection} FROM (SELECT ? AS payload)) AS ${table} WHERE ${m.check ? `(${m.check.sql}) AND ` : ''}${gate}`, values: [canonical(m.row), ...(m.check?.values ?? []), ...values] });
            }
            else
                statements.push(m.check ? { sql: `INSERT INTO ${table}(${cols.map(identifier).join(',')}) SELECT ${cols.map(identifier).join(',')} FROM (SELECT ${cols.map(c => `? AS ${identifier(c)}`).join(',')}) AS ${table} WHERE (${m.check.sql}) AND ${gate}`, values: [...Object.values(m.row), ...m.check.values, ...values] } : { sql: `INSERT INTO ${table}(${cols.map(identifier).join(',')}) SELECT ${cols.map(() => '?').join(',')} WHERE ${gate}`, values: [...Object.values(m.row), ...values] });
        }
        else if (m.kind === 'update') {
            const cols = Object.keys(m.set);
            if (!cols.length)
                throw new Error('Empty update');
            if (cols.length > 60 && !Object.values(m.set).some(v => v instanceof Uint8Array))
                statements.push({ sql: `WITH mutation_payload(value) AS (SELECT ?) UPDATE ${table} SET ${cols.map(c => `${identifier(c)}=(SELECT json_extract(value,'$.${c}') FROM mutation_payload)`).join(',')} WHERE (${m.where.sql}) AND ${gate}`, values: [canonical(m.set), ...m.where.values, ...values] });
            else
                statements.push({ sql: `UPDATE ${table} SET ${cols.map(c => `${identifier(c)}=?`).join(',')} WHERE (${m.where.sql}) AND ${gate}`, values: [...Object.values(m.set), ...m.where.values, ...values] });
        }
        else if(m.kind==='replaceText'){
            const expression=textReplacement(m.column,m.needles,m.replacement);
            // FTS virtual-table commits can overwrite changes() after a large update.
            // Count the selected rows atomically before replacement, then verify completion.
            statements.push({sql:`INSERT INTO admission_assertions(nonce,sequence,ok) SELECT ?,?,CASE WHEN (SELECT count(*) FROM ${table} WHERE ${m.where.sql})=? THEN 1 ELSE 0 END WHERE ${gate}`,values:[nonce,sequence++,...m.where.values,m.expectedRows,...values]});
            statements.push({sql:`UPDATE ${table} SET ${identifier(m.column)}=${expression.sql} WHERE (${m.where.sql}) AND ${gate}`,values:[...expression.values,...m.where.values,...values]});
            statements.push({sql:`INSERT INTO admission_assertions(nonce,sequence,ok) SELECT ?,?,CASE WHEN NOT EXISTS(SELECT 1 FROM ${table} WHERE (${m.where.sql}) AND ${identifier(m.column)} IS NOT (${expression.sql})) THEN 1 ELSE 0 END WHERE ${gate}`,values:[nonce,sequence++,...m.where.values,...expression.values,...values]});
            return;
        }
        else
            statements.push({ sql: `DELETE FROM ${table} WHERE (${m.where.sql}) AND ${gate}`, values: [...m.where.values, ...values] });
        statements.push({ sql: `INSERT INTO admission_assertions(nonce,sequence,ok) SELECT ?,?,CASE WHEN changes()=? THEN 1 ELSE 0 END WHERE ${gate}`, values: [nonce, sequence++, m.kind === 'insert' ? 1 : m.expectedRows, ...values] });
    };
    const transportBytes=(m:SqlMutation)=>new TextEncoder().encode(canonical(m.kind==='insert'?m.row:{where:[...m.where.values],expected:m.expectedRows,...(m.kind==='update'?{set:m.set}:{})})).byteLength+1;
    const appendAll = (mutations: readonly SqlMutation[]) => { for (let i = 0; i < mutations.length;) {
        const first = mutations[i]!, key = mutationGroupKey(first), group = [first];
        let size = key ? transportBytes(first) : 0;
        i++;
        while (key && i < mutations.length && group.length < 500 && mutationGroupKey(mutations[i]!) === key) {
            const next = mutations[i]!, bytes = transportBytes(next);
            if (size + bytes > 700000)
                break;
            size += bytes;
            group.push(next);
            i++;
        }
        if (group.length > 1)
            statements.push(...compileMutationGroup(group, gate, values, nonce, () => sequence++));
        else
            append(first);
    } };
    appendAll(provenance.segments.map((subjects_json,segment_index)=>({kind:'insert' as const,table:provenanceTable,row:{command_id:plan.commandId,segment_index,subjects_json}})));
    appendAll([...plan.mutations, ...plan.permit.reservationMutations]);
    appendAll(plan.audit.map(a => ({ kind: 'insert' as const, table: auditTable, row: { id: createUlid(), command_id: plan.commandId, actor_id: ctx.principal.id, actor_kind: ctx.principal.kind, app_id: a.subject?.appId ?? plan.appId, action: a.action, subject_json: canonical(a.subject), changes_json: canonical(a.changes), source_ids_json: canonical(a.sourceIds), personal_refs_json: canonical(a.personalContentRefs), created_at: now } })));
    const eventIds: string[] = [];
    appendAll(plan.events.map(e => { const id = createUlid(); eventIds.push(id); return { kind: 'insert' as const, table: eventTable, row: { id, command_id: plan.commandId, app_id: plan.appId, name: e.name, version: e.version, subject_json: canonical(e.subject), payload_json: canonical(e.payload), cause_run_ids_json: canonical(e.causeRunIds), created_at: now } }; }));
    plan.outbox.forEach(o => append({ kind: 'insert', table: outboxTable, row: { id: createUlid(), command_id: plan.commandId, app_id: plan.appId, action: o.action, version: o.version, input_json: canonical(o.input), not_before: o.notBefore, grant_id: o.grantId, subject_json: canonical(o.subject), source_release_id: o.sourceReleaseId, cause_run_ids_json: canonical(o.causeRunIds), state: 'pending', created_at: now, updated_at: now } }));
    const changed: RevisionRef[] = [...(plan.changed ?? [])];
    const result: CommandResult<T> = { commandId: plan.commandId, state: 'committed', value: plan.committedResult, changed, eventIds };
    statements.push({ sql: `UPDATE command_admissions SET state='committed',result_json=?,updated_at=? WHERE command_id=? AND batch_nonce=? AND state='admitted'`, values: [canonical(result), now, ...values] });
    if(options.captureRecordEvents)statements.push({sql:'DELETE FROM record_automation_context WHERE command_id=?',values:[plan.commandId]});
    statements.push({ sql: 'DELETE FROM admission_assertions WHERE nonce=?', values: [nonce] });
    for(const statement of statements){if(statement.values.length>100||new TextEncoder().encode(statement.sql).byteLength>100000||statement.values.some(v=>typeof v==='string'&&new TextEncoder().encode(v).byteLength>1900000||v instanceof Uint8Array&&v.byteLength>1900000))throw new AdmissionError('capacity_limit','Command exceeds a D1 statement or value size limit');}
    if(statements.length>1000)throw new AdmissionError('capacity_limit','Atomic command exceeds the D1 query budget');
    return { nonce, statements, result };
}
