import type { Principal, RequestContext, PolicyPort } from '../authority/ports';
import type { SqlPredicate } from '../admission/ports';
import type { createRecordMetadata } from './metadata.server';
import { and, trustedPredicate } from '../admission/sql.server';
import { AdmissionError } from '../admission/errors';
import { createUlid } from '../../core/shared/ids';

const ttlMs = 15_000;
type Target = { appId: string; entityId: string } | { viewId: string };
type Participant = { id: string; name: string };
type Stored = {
    id: string; principal_id: string; session_id: string; base_session_id: string | null;
    authentication_epoch: number; human_id: string; issued_at: number; session_expires_at: number;
};

/** Ephemeral durable browser activity, independent of record admission/cursor revisions. */
export function createRecordPresence(db: D1Database, policy: PolicyPort, metadata: ReturnType<typeof createRecordMetadata>) {
    function browser(ctx: RequestContext) {
        const p = ctx.principal;
        if (!['http', 'start'].includes(ctx.ingress) || p.kind !== 'human' || !p.humanId || !p.sessionId || p.credentialId || p.delegationBound || p.proposer || p.viaProposer)
            throw new AdmissionError('forbidden', 'Presence requires a current human browser session');
    }
    async function checked(ctx: RequestContext, target: Target) {
        browser(ctx);
        const view = 'viewId' in target ? await metadata.readView(ctx, target.viewId) : null;
        const { appId, entityId } = view ?? (target as { appId: string; entityId: string });
        const scope = await policy.scope(ctx, { appId, entityId, purpose: 'read' });
        const guards = [...scope.currentAuthorityGuards];
        if (view) guards.push(trustedPredicate(`EXISTS(SELECT 1 FROM record_views WHERE id=? AND app_id=? AND entity_id=? AND version=? AND (visibility='app' OR (visibility='private' AND owner_id=?)))`, [view.id, appId, entityId, view.version, ctx.principal.id]));
        return { appId, entityId, viewId: view?.id ?? null, key: view ? `view:${view.id}:${view.version}` : `entity:${appId}:${entityId}`, guards };
    }
    function unavailable(error: unknown) {
        return error instanceof Error && 'code' in error && ['forbidden', 'not_found', 'grant_expired', 'grant_revoked', 'signed_out'].includes(String(error.code));
    }
    return {
        async heartbeat(context: RequestContext, target: Target): Promise<{ participants: Participant[]; revision: number; expiresInMs: number }> {
            // Time and identity come exclusively from the server authentication context.
            const ctx: RequestContext = { ...context, now: new Date().toISOString() };
            const own = await checked(ctx, target), current = and(...own.guards), now = Date.now();
            const written = await db.batch([
                db.prepare("DELETE FROM record_presence WHERE expires_at<=MAX(?,unixepoch('subsec')*1000)").bind(now),
                db.prepare(`INSERT INTO record_presence(id,scope_key,app_id,entity_id,view_id,principal_id,session_id,base_session_id,authentication_epoch,expires_at,created_at,updated_at)
                    SELECT ?,?,?,?,?,?,?,?,?,MIN(?,?),?,? WHERE ${current.sql}
                    ON CONFLICT(scope_key,principal_id) DO UPDATE SET session_id=excluded.session_id,base_session_id=excluded.base_session_id,
                    authentication_epoch=excluded.authentication_epoch,expires_at=excluded.expires_at,updated_at=excluded.updated_at
                    RETURNING id`)
                    .bind(createUlid(), own.key, own.appId, own.entityId, own.viewId, ctx.principal.id, ctx.principal.sessionId, ctx.principal.baseSessionId ?? null,
                        ctx.principal.authenticationEpoch, now + ttlMs, Date.parse(ctx.principal.expiresAt), now, now, ...current.values),
            ]);
            if (!written[1]!.results.length) throw new AdmissionError('forbidden', 'Presence authority changed');
            const candidates = await db.prepare(`SELECT a.id,a.principal_id,a.session_id,a.base_session_id,a.authentication_epoch,p.human_id,
                s.created_at AS issued_at,s.expires_at AS session_expires_at FROM record_presence a
                JOIN authority_principals p ON p.id=a.principal_id AND p.kind='human' AND p.state='active'
                JOIN authority_sessions s ON s.id=a.session_id AND s.principal_id=p.id
                WHERE a.scope_key=? AND a.expires_at>MAX(?,unixepoch('subsec')*1000) ORDER BY a.principal_id`)
                .bind(own.key, Date.now()).all<Stored>();
            const visible: { row: Stored; guards: SqlPredicate[] }[] = [];
            for (const row of candidates.results) {
                const principal: Principal = { id: row.principal_id, kind: 'human', humanId: row.human_id, sessionId: row.session_id,
                    ...(row.base_session_id ? { baseSessionId: row.base_session_id } : {}), credentialId: null,
                    authenticationEpoch: row.authentication_epoch, issuedAt: new Date(row.issued_at).toISOString(), expiresAt: new Date(row.session_expires_at).toISOString() };
                try {
                    const participant = await checked({ ...ctx, principal, now: new Date().toISOString() }, target);
                    visible.push({ row, guards: participant.guards });
                }
                catch (error) { if (!unavailable(error)) throw error; }
            }
            // One final transaction fences every projected person and the requester against
            // current policy/session/view state, including Base-session revocation. No names
            // are retained, and no session/authority metadata leaves this service.
            const statements = visible.map(({ row, guards }) => {
                const guard = and(current, ...guards);
                return db.prepare(`SELECT p.id,o.name FROM record_presence a
                    JOIN authority_principals p ON p.id=a.principal_id JOIN operators o ON o.id=p.human_id AND o.active=1
                    WHERE a.id=? AND a.scope_key=? AND a.session_id=? AND a.base_session_id IS ? AND a.authentication_epoch=?
                    AND a.expires_at>MAX(?,unixepoch('subsec')*1000) AND (${guard.sql})`)
                    .bind(row.id, own.key, row.session_id, row.base_session_id, row.authentication_epoch, Date.now(), ...guard.values);
            });
            const result = await db.batch([
                db.prepare(`SELECT 1 WHERE ${current.sql}`).bind(...current.values),
                db.prepare("SELECT COALESCE(MAX(rowid),0) AS revision FROM command_admissions WHERE state='committed'"),
                ...statements,
            ]);
            if (!result[0]!.results.length) throw new AdmissionError('forbidden', 'Presence authority changed');
            return { participants: result.slice(2).flatMap(value => value.results as Participant[]), revision: Number((result[1]!.results[0] as { revision: number }).revision), expiresInMs: ttlMs };
        },
    };
}
