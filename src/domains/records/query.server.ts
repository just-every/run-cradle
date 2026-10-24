import { otherActorCellChanges } from './history-conflicts.server';
import type { RevisionRef } from '../../contracts/primitives';
import { assertCurrentScopeAuthority } from '../authority/guards.server';
import { createCellProjection } from '../authority/cell-projection.server';
import { readIncomingRelations } from './incoming.server';
import type { RecordAttachmentPort } from './attachments.server';
import { attachmentMember } from './store-references';
import type { Cell, CellValue, Page, Ref, AllowedAction } from '../../contracts/primitives';
import type { RequestContext, PolicyPort, PolicyScope } from '../authority/ports';
import type { DescriptorRegistry, EntityDescriptor, FieldStorage } from './descriptors.server';
import type { Query, RecordRow } from './contracts';
import { decode } from './codec.server';
import { and, eq, identifier, trustedPredicate } from '../admission/sql.server';
import { matchesFilter, compareRecords } from './evaluated-query';
import { canonical } from '../admission/canonical';
import { compileFilter, filterFields } from './filter.server';
import { querySchema } from './validators';
import { evaluateExpression, unavailable, validateExpressionGraph } from './formulas';
import { createCursorCodec } from './cursor.server';
import { AdmissionError } from '../admission/errors';
import { linkedCalculationCells } from './linked-calculation.server';
export type RecordDetailPort = (ctx: RequestContext, ref: Ref) => Promise<{
    evidenceIds: string[];
    commentCount: number;
    activeCaseIds: string[];
}>;
export function createRecordReader(db: D1Database, registry: DescriptorRegistry, policy: PolicyPort, cursorSecret: string, details?: RecordDetailPort, attachments?: RecordAttachmentPort) {
    validateExpressionGraph(registry.list().map(d => d.schema));
    const cursor = createCursorCodec(cursorSecret);
    const projectCell = createCellProjection(db, registry, policy, attachments);
    const snapshots = new WeakMap<PolicyScope, {
        ctx: RequestContext;
        rows: Map<string, Record<string, unknown>>;
    }>();
    const capabilityCache = new WeakMap<RequestContext, Map<string, Promise<boolean>>>();
    async function revision() { return (await db.prepare("SELECT COALESCE(MAX(rowid),0) AS revision FROM command_admissions WHERE state='committed'").first<{
        revision: number;
    }>())!.revision; }
    function enforce(ctx: RequestContext, scope: PolicyScope, d: EntityDescriptor) { if (scope.principal.id !== ctx.principal.id || scope.appId !== d.schema.appId || scope.entityId !== d.schema.id || scope.validUntil <= new Date().toISOString())
        throw new AdmissionError('forbidden', 'Record scope is no longer valid'); }
    function predicate(scope: PolicyScope, d: EntityDescriptor, q: Query) { return and(scope.rowPredicate, ...scope.currentAuthorityGuards, compileFilter(d, scope, q.filter), q.includeArchived ? trustedPredicate('1') : trustedPredicate(`${identifier(d.lifecycleColumn)} NOT IN ('archived','deleted')`)); }
    async function raw(ctx: RequestContext, scope: PolicyScope, ref: Ref): Promise<Record<string, unknown> | null> { const d = registry.get(ref.appId, ref.entityId); enforce(ctx, scope, d); const snapshot = snapshots.get(scope); if (snapshot?.ctx === ctx)
        return snapshot.rows.get(ref.recordId) ?? null; const where = and(scope.rowPredicate, ...scope.currentAuthorityGuards, eq(d.table, d.idColumn, ref.recordId)); return db.prepare(`SELECT * FROM ${identifier(d.table.tableId)} WHERE ${where.sql}`).bind(...where.values).first<Record<string, unknown>>(); }
    async function withRows<T>(ctx: RequestContext, scope: PolicyScope, refs: readonly Ref[], run: () => Promise<T>): Promise<T> {
        const d = registry.get(scope.appId, scope.entityId);
        enforce(ctx, scope, d);
        if (refs.length > 10000 || refs.some(ref => ref.appId !== scope.appId || ref.entityId !== scope.entityId || !/^[0-9A-HJKMNP-TV-Z]{26}$/.test(ref.recordId)))
            throw new AdmissionError('validation', 'Invalid scoped record batch');
        if (snapshots.has(scope))
            throw new AdmissionError('internal', 'Concurrent scoped preparation is not supported');
        const where = and(scope.rowPredicate, ...scope.currentAuthorityGuards, trustedPredicate(`${identifier(d.idColumn)} IN (SELECT value FROM json_each(?))`, [canonical(refs.map(ref => ref.recordId))]));
        const rows = await db.prepare(`SELECT * FROM ${identifier(d.table.tableId)} WHERE ${where.sql}`).bind(...where.values).all<Record<string, unknown>>();
        snapshots.set(scope, { ctx, rows: new Map(rows.results.map(row => [String(row[d.idColumn]), row])) });
        try {
            return await run();
        }
        finally {
            snapshots.delete(scope);
        }
    }
    async function actions(ctx: RequestContext, scope: PolicyScope, d: EntityDescriptor, ref: Ref, version: number, lifecycle: string): Promise<AllowedAction[]> { const candidates = [{ action: 'record.patch', applicable: d.writePolicy?.patch !== false && d.schema.fields.some(f => f.type !== 'computed' && !f.readOnly && !d.writePolicy?.protectedFieldIds?.includes(f.id)) }, { action: 'record.delete', applicable: d.writePolicy?.delete !== false }, ...d.schema.lifecycle.transitions.filter(t => t.from.includes(lifecycle)).map(t => ({ action: t.action, applicable: !d.writePolicy?.transitions || d.writePolicy.transitions.includes(t.action) }))]; return Promise.all(candidates.map(async (item) => { if (!item.applicable)
        return { action: item.action, enabled: false, reason: 'This operation requires a typed domain action.', requiredDecisionId: null }; try {
        let cache = capabilityCache.get(ctx);
        if (!cache) {
            cache = new Map();
            capabilityCache.set(ctx, cache);
        }
        const key = [ref.appId, ref.entityId, scope.policyVersion, item.action].join(':');
        let uniform = cache.get(key);
        if (!uniform) {
            uniform = (async () => { try {
                await policy.authorize(ctx, { appId: ref.appId, targetEntityId: ref.entityId, action: item.action, expected: [], cost: [], inputHash: '0'.repeat(64) });
                return true;
            }
            catch (error) {
                if (error instanceof Error && 'code' in error && ['forbidden', 'grant_expired', 'grant_revoked', 'not_found'].includes(String(error.code)))
                    return false;
                throw error;
            } })();
            cache.set(key, uniform);
        }
        if (!await uniform)
            await policy.authorize(ctx, { appId: ref.appId, action: item.action, expected: [{ ref, version }], cost: [], inputHash: '0'.repeat(64) });
        return { action: item.action, enabled: true, reason: null, requiredDecisionId: null };
    }
    catch (error) {
        if (error instanceof Error && 'code' in error && ['forbidden', 'not_found', 'grant_expired', 'grant_revoked', 'separation_of_duties', 'budget_exhausted'].includes(String(error.code)))
            return { action: item.action, enabled: false, reason: 'Current authority does not permit this action.', requiredDecisionId: null };
        throw error;
    } })); }
    async function render(ctx: RequestContext, scope: PolicyScope, d: EntityDescriptor, row: Record<string, unknown>, selected?: string[], path = new Set<string>(), purpose: 'read' | 'export' = 'read'): Promise<RecordRow> {
        enforce(ctx, scope, d);
        const ref = { appId: d.schema.appId, entityId: d.schema.id, recordId: String(row[d.idColumn]) };
        const key = ref.appId + ':' + ref.entityId + ':' + ref.recordId;
        const cache = new Map<string, Promise<Cell>>();
        async function cell(id: string): Promise<Cell> { if (cache.has(id))
            return cache.get(id)!; const pending = compute(id); cache.set(id, pending); return pending; }
        async function linked(storage: FieldStorage): Promise<Ref[]> { if (storage.join) {
            const join = await db.prepare(`SELECT value FROM ${identifier(storage.join.table.tableId)} WHERE record_id=? ORDER BY position,id`).bind(ref.recordId).all<{
                value: string;
            }>();
            return join.results.map(r => ({ appId: storage.field.relation!.ownerAppId, entityId: storage.field.relation!.entityId, recordId: r.value }));
        } const v = decode(storage, row); return v ? [v as Ref] : []; }
        async function compute(id: string): Promise<Cell> {
            const storage = d.fields.get(id);
            if (!storage || !scope.readableFieldIds.includes(id))
                return { state: 'redacted', reason: 'policy' };
            if (storage.field.type === 'computed') {
                const fieldKey = key + ':' + id;
                if (path.has(fieldKey) || path.size >= 64)
                    return unavailable('dependency_limit', [id], 'Formula cycle or depth exceeds 64');
                const nextPath = new Set(path).add(fieldKey);
                return evaluateExpression(storage.field.expression!, { relationMany:relId=>d.fields.get(relId)?.field.relation?.cardinality==='many', sourceOptions:(relId,valId)=>{const relation=d.fields.get(relId)?.field.relation;return relation?registry.get(relation.ownerAppId,relation.entityId).fields.get(valId)?.field.options:undefined}, sourceType:(relId,valId)=>{const relation=d.fields.get(relId)?.field.relation;if(!relation)return;const field=registry.get(relation.ownerAppId,relation.entityId).fields.get(valId)?.field;return field?.type==='computed'?field.resultType:field?.type}, field: async (dep) => { if (dep === id)
                        return unavailable('dependency_limit', [id], 'Formula cycle'); const result=await cell(dep),source=d.fields.get(dep)?.field;
                        if(result.state==='value'&&result.value!==null&&(source?.type==='select'||source?.type==='computed'&&source.resultType==='select')){const option=source.options?.find(option=>option.id===result.value);return option?{state:'value',value:option.label}:unavailable('invalid_source',[dep],'Source select option is unavailable');}return result; }, rollup: async (relId, valId, filter, countOnly, selection) => {
                        const relation = d.fields.get(relId);
                        if (!relation?.field.relation || !scope.discoverableRelations.includes(relId) || !scope.readableFieldIds.includes(relId))
                            return [{ state: 'redacted', reason: 'policy' }];
                        const refs = await linked(relation);
                        const target = registry.get(relation.field.relation.ownerAppId, relation.field.relation.entityId);
                        let targetScope: PolicyScope;
                        try { targetScope = await policy.scope(ctx, { appId: target.schema.appId, entityId: target.schema.id, purpose }); }
                        catch (error) { if (error instanceof Error && 'code' in error && ['forbidden','not_found','grant_expired','grant_revoked'].includes(String(error.code))) return [{state:'redacted',reason:'policy'}]; throw error; }
                        return linkedCalculationCells(db,target,targetScope,refs,valId,filter,!!countOnly,selection,async(row,fieldId)=>(await render(ctx,targetScope,target,row,[fieldId],nextPath,purpose)).fields[fieldId]!);
                    } });
            }
            if (storage.field.type === 'relation')
                return projectCell(ctx, scope, ref, id, { state: 'value', value: await linked(storage) });
            if (storage.join) {
                const values = await db.prepare(`SELECT value FROM ${identifier(storage.join.table.tableId)} WHERE record_id=? ORDER BY position,id`).bind(ref.recordId).all<{
                    value: string;
                }>();
                if (storage.field.type === 'attachment')
                    return projectCell(ctx, scope, ref, id, { state: 'value', value: values.results.map(file => attachmentMember(file.value)) });
                return { state: 'value', value: values.results.map(r => r.value) };
            }
            return { state: 'value', value: decode(storage, row) };
        }
        const ids = selected ?? d.schema.fields.map(f => f.id), fields: Record<string, Cell> = {};
        for (const id of ids)
            fields[id] = await cell(id);
        return { id: ref.recordId, version: Number(row[d.versionColumn]), createdAt: String(row[d.createdColumn]), updatedAt: String(row[d.updatedColumn]), ref, schemaVersion: Number(row[d.schemaVersionColumn]), lifecycle: String(row[d.lifecycleColumn]), fields, allowedActions: await actions(ctx, scope, d, ref, Number(row[d.versionColumn]), String(row[d.lifecycleColumn])) };
    }
    /** Returns null when a commit lands while the page is read; the caller reads again from a fresh revision. */
    async function executeQuery(ctx: RequestContext, scope: PolicyScope, input: Query, purpose: 'read' | 'export'): Promise<Page<RecordRow> | null> {
        const q = querySchema.parse(input), d = registry.get(scope.appId, scope.entityId);
        // Group ordering is part of the query, so grid pages and exports share the same sequence.
        if (q.groupBy?.length) { const sort=q.sort??[]; q.sort=[...q.groupBy.map(fieldId=>({fieldId,direction:sort.find(s=>s.fieldId===fieldId)?.direction??'asc' as const})),...sort.filter(s=>!q.groupBy!.includes(s.fieldId))]; }
        enforce(ctx, scope, d);
        for (const id of [...(q.fields ?? []), ...(q.groupBy ?? []), ...(q.sort ?? []).map(s => s.fieldId)])
            if (!d.fields.has(id) || !scope.readableFieldIds.includes(id))
                throw new AdmissionError('forbidden', 'Query references an unavailable field');
        const used = [...filterFields(q.filter), ...(q.sort ?? []).map(s => s.fieldId)];
        for (const id of used)
            if (!scope.readableFieldIds.includes(id))
                throw new AdmissionError('forbidden', 'Query references an unavailable field');
        const evaluated = used.some(id => { const f = d.fields.get(id); return !f || f.join || f.field.type === 'computed' || f.field.type === 'relation' || f.field.type === 'money' && (q.sort ?? []).some(s => s.fieldId === id); });
        const where = predicate(scope, d, evaluated ? { ...q, filter: undefined } : q), sort = (q.sort ?? []).map(s => { const f = d.fields.get(s.fieldId)!; if (evaluated)
            return `${identifier(d.idColumn)} ASC`; return `${identifier(f.sortColumn ?? f.column)} ${s.direction.toUpperCase()}`; });
        sort.push(`${identifier(d.idColumn)} ASC`);
        const rev = await revision(), binding = await cursor.binding({ principal: ctx.principal.id, session:ctx.principal.sessionId, credential:ctx.principal.credentialId, baseSession:ctx.principal.baseSessionId??null, epoch: ctx.principal.authenticationEpoch, app: scope.appId, entity: scope.entityId, policy: scope.policyVersion, fields: scope.readableFieldIds, revision: d.schema.physicalRevision, query: { ...q, cursor: null, consistencyToken: null }, predicate: (scope.cursorPredicate??scope.rowPredicate).sql, values: (scope.cursorPredicate??scope.rowPredicate).values });
        let offset = 0;
        let after: {id:string;fields:Record<string,Cell>} | undefined;
        if (q.cursor) {
            const p = await cursor.decode(q.cursor);
            if (p.binding !== binding || p.revision !== rev)
                throw new AdmissionError('stale_cursor', 'Records or access changed. Refresh this query.');
            offset = p.offset;
            if (p.after) {
                const boundaryRow=await raw(ctx,scope,{appId:scope.appId,entityId:scope.entityId,recordId:p.after});
                if(!boundaryRow)throw new AdmissionError('stale_cursor','The sort boundary changed. Refresh this query.');
                after=await render(ctx,scope,d,boundaryRow,(q.sort??[]).map(s=>s.fieldId),new Set(),purpose);
            }
            if (evaluated && offset > 0 && !after) throw new AdmissionError('stale_cursor','Refresh this evaluated query to continue.');
        }
        const limit = q.limit ?? 100;
        if (evaluated) {
            // Scan bounded raw pages and retain only this result page. The signed
            // sort boundary avoids retaining every preceding row for later pages.
            const selected = [...new Set([...(q.fields ?? d.schema.fields.map(f => f.id)), ...used])];
            const numeric = new Set(d.schema.fields.filter(f => f.type === 'number' || f.type === 'computed' && f.resultType === 'number').map(f => f.id));
            const compareRow = (a:Pick<RecordRow,'id'|'fields'>,b:Pick<RecordRow,'id'|'fields'>)=>compareRecords(a,b,q.sort??[],numeric);
            const candidates:RecordRow[]=[];
            let lastId:string|undefined,total=0;
            for (;;) {
                const boundary=lastId===undefined?trustedPredicate('1=1'):trustedPredicate(`${identifier(d.idColumn)}> ?`,[lastId]);
                const pageWhere=and(where,boundary);
                const rawRows=await db.prepare(`SELECT * FROM ${identifier(d.table.tableId)} WHERE ${pageWhere.sql} ORDER BY ${identifier(d.idColumn)} ASC LIMIT 200`).bind(...pageWhere.values).all<Record<string,unknown>>();
                for(const rawRow of rawRows.results){
                    const row=await render(ctx,scope,d,rawRow,selected,new Set(),purpose);
                    if(!matchesFilter(row,q.filter,numeric,ctx.now))continue;
                    total++;
                    if(after&&compareRow(row,after)<=0)continue;
                    // Insertion into at most limit+1 entries keeps allocation bounded
                    // even for a computed sort across the whole underlying table.
                    let low=0,high=candidates.length;
                    while(low<high){const middle=(low+high)>>>1;if(compareRow(candidates[middle]!,row)<0)low=middle+1;else high=middle;}
                    if(low<=limit){candidates.splice(low,0,row);if(candidates.length>limit+1)candidates.pop();}
                }
                if(await revision()!==rev)return null;
                await assertCurrentScopeAuthority(db,ctx,scope);
                if(rawRows.results.length<200)break;
                lastId=String(rawRows.results.at(-1)![d.idColumn]);
            }
            const hasMore=candidates.length>limit,pageRows=candidates.slice(0,limit),last=pageRows.at(-1);
            const items=pageRows.map(row=>({...row,fields:Object.fromEntries(Object.entries(row.fields).filter(([id])=>!q.fields||q.fields.includes(id)))}));
            const nextCursor=hasMore&&last?await cursor.encode({binding,revision:rev,offset:offset+items.length,after:last.id}):null;
            return {items,nextCursor,total:{kind:total>10000?'at_least':'exact',value:Math.min(total,10000)},evaluatedAt:ctx.now};
        }
        const [rows, count] = await db.batch([db.prepare(`SELECT * FROM ${identifier(d.table.tableId)} WHERE ${where.sql} ORDER BY ${sort.join(',')} LIMIT ? OFFSET ?`).bind(...where.values, limit + 1, offset), db.prepare(`SELECT COUNT(*) AS total FROM (SELECT 1 FROM ${identifier(d.table.tableId)} WHERE ${where.sql} LIMIT 10001)`).bind(...where.values)]);
        const items = await Promise.all((rows!.results as Record<string, unknown>[]).slice(0, limit).map(row => render(ctx, scope, d, row, q.fields, new Set(), purpose)));
        if (await revision() !== rev)
            return null;
        const total = Number((count!.results[0] as {
            total: number;
        }).total);
        return { items, nextCursor: rows!.results.length > limit ? await cursor.encode({ binding, revision: rev, offset: offset + limit }) : null, total: { kind: total > 10000 ? 'at_least' : 'exact', value: Math.min(total, 10000) }, evaluatedAt: new Date().toISOString() };
    }
    async function query(ctx: RequestContext, scope: PolicyScope, input: Query, purpose: 'read' | 'export' = 'read'): Promise<Page<RecordRow>> { try {
        for (let attempt = 0; attempt < 3; attempt++) {
            const page = await executeQuery(ctx, scope, input, purpose);
            if (page)
                return page;
        }
        throw new AdmissionError('stale_cursor', 'Records changed during query. Refresh.');
    }
    catch (error) {
        if (error instanceof AdmissionError || error instanceof Error && 'issues' in error)
            throw error;
        if (error instanceof Error && /unavailable|expects|requires|Invalid|depth|currency|canonical|exceeds/.test(error.message))
            throw new AdmissionError('validation', error.message);
        throw error;
    } }
    async function groups(ctx: RequestContext, scope: PolicyScope, q: Query): Promise<{
        key: CellValue;
        count: number;
    }[]> { if (!q.groupBy?.length)
        return []; const descriptor = registry.get(scope.appId, scope.entityId); const involved = [...q.groupBy, ...filterFields(q.filter)]; if (involved.every(id => { const s = descriptor.fields.get(id); return s && !s.join && !['computed', 'relation'].includes(s.field.type); })) {
        for (const id of involved)
            if (!scope.readableFieldIds.includes(id))
                throw new AdmissionError('forbidden', 'Grouping field is unavailable');
        const storage = q.groupBy.map(id => descriptor.fields.get(id)!);
        const columns = storage.flatMap(s => [s.column, ...(s.currencyColumn ? [s.currencyColumn, s.scaleColumn!] : [])]);
        const where = predicate(scope, descriptor, q);
        const grouped = await db.prepare(`SELECT ${columns.map(identifier).join(',')},COUNT(*) AS group_count FROM ${identifier(descriptor.table.tableId)} WHERE ${where.sql} GROUP BY ${columns.map(identifier).join(',')} ORDER BY ${columns.map(identifier).join(',')}`).bind(...where.values).all<Record<string, unknown>>();
        return grouped.results.map(row => { const values = storage.map(s => decode(s, row)); return { key: values.length === 1 ? values[0]! : canonical(values), count: Number(row.group_count) }; });
    } const counts = new Map<string, {
        key: CellValue;
        count: number;
    }>(); let token: string | undefined; do {
        const page = await query(ctx, scope, { ...q, fields: q.groupBy, limit: 200, cursor: token });
        for (const row of page.items) {
            const cells = q.groupBy.map(id => row.fields[id]);
            if (cells.some(c => c?.state !== 'value'))
                throw new AdmissionError('forbidden', 'Grouping field is unavailable');
            const values = cells.map(c => (c as Extract<Cell, {
                state: 'value';
            }>).value);
            const key = values.length === 1 ? values[0]! : canonical(values);
            const encoded = canonical(key);
            const old = counts.get(encoded);
            if (old)
                old.count++;
            else
                counts.set(encoded, { key, count: 1 });
        }
        token = page.nextCursor ?? undefined;
    } while (token); return [...counts.values()]; }
    async function record(ctx: RequestContext, scope: PolicyScope, ref: Ref) { const d = registry.get(ref.appId, ref.entityId), row = await raw(ctx, scope, ref); if (!row)
        throw new AdmissionError('not_found', 'Record not found'); return render(ctx, scope, d, row); }
    return { otherActorCellChanges: (ctx:RequestContext, expected:RevisionRef[])=>otherActorCellChanges(db,ctx,expected), assertScope: (ctx: RequestContext, scope: PolicyScope) => assertCurrentScopeAuthority(db, ctx, scope), query, groups, raw, withRows, render, revision, record, projectCell, async get(ctx: RequestContext, scope: PolicyScope, ref: Ref) {
            const result = await record(ctx, scope, ref);
            if (!details)
                throw new AdmissionError('unconfigured', 'Record detail evidence/case port is required');
            const d = registry.get(ref.appId, ref.entityId), relations: {
                fieldId: string;
                page: Page<RecordRow>;
            }[] = [];
            for (const [fieldId, s] of d.fields) {
                if (!s.field.relation || !scope.discoverableRelations.includes(fieldId))
                    continue;
                const cell = result.fields[fieldId];
                if (cell?.state !== 'value' || cell.value === null)
                    continue;
                const refs = (Array.isArray(cell.value) ? cell.value : [cell.value]) as Ref[];
                if (!refs.length)
                    continue;
                const targetScope = await policy.scope(ctx, { appId: s.field.relation.ownerAppId, entityId: s.field.relation.entityId, purpose: 'read' }), target = registry.get(targetScope.appId, targetScope.entityId);
                const restricted = { ...targetScope, rowPredicate: and(targetScope.rowPredicate, trustedPredicate(`${identifier(target.idColumn)} IN (SELECT value FROM json_each(?))`, [JSON.stringify(refs.map(r => r.recordId))])) };
                relations.push({ fieldId, page: await query(ctx, restricted, { limit: 200 }) });
            }
            return { record: result, relations, incomingRelations: await readIncomingRelations(db,registry,policy,query,ctx,scope,ref), ...await details(ctx, ref), historyUrl: `/api/v1/history?appId=${ref.appId}&entityId=${ref.entityId}&recordId=${ref.recordId}` };
        } };
}
