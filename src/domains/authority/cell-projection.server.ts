import type { Cell, Ref, StoreReference } from '../../contracts/primitives';
import type { PolicyPort, PolicyScope, RequestContext } from './ports';
import { AdmissionError } from '../admission/errors';
import { and, identifier, trustedPredicate } from '../admission/sql.server';
import type { RecordAttachmentPort } from '../records/attachments.server';
import type { DescriptorRegistry } from '../records/descriptors.server';

const redacted: Cell = { state: 'redacted', reason: 'policy' };
const isRef = (value: unknown): value is Ref => !!value && typeof value === 'object' && 'appId' in value && 'entityId' in value && 'recordId' in value;
const isFile = (value: unknown): value is { fileId: string } => !!value && typeof value === 'object' && 'fileId' in value && typeof value.fileId === 'string';
const isReference = (value: unknown): value is { reference: StoreReference } => !!value && typeof value === 'object' && 'reference' in value;

/** Current values and retained audit cells share the same reference authority. */
export function createCellProjection(db: D1Database, registry: DescriptorRegistry, policy: PolicyPort, attachments?: RecordAttachmentPort) {
    return async function projectCell(ctx: RequestContext, scope: PolicyScope, ref: Ref, fieldId: string, cell: Cell): Promise<Cell> {
        if (scope.principal.id !== ctx.principal.id || scope.appId !== ref.appId || scope.entityId !== ref.entityId || scope.validUntil <= new Date().toISOString())
            throw new AdmissionError('forbidden', 'Record scope is no longer valid');
        const field = registry.get(ref.appId, ref.entityId).fields.get(fieldId)?.field;
        if (!field || !scope.readableFieldIds.includes(fieldId))
            return redacted;
        if (cell.state !== 'value')
            return cell.state === 'unavailable' && cell.fieldIds.some(id => !scope.readableFieldIds.includes(id)) ? redacted : cell;
        const values = cell.value === null ? [] : Array.isArray(cell.value) ? cell.value : [cell.value];
        if (field.type === 'relation') {
            if (!field.relation || !scope.discoverableRelations.includes(fieldId) || !values.every(isRef))
                return redacted;
            const relation = field.relation;
            // A retained ref must still identify the current relation's app and entity.
            const candidates = values.filter(value => value.appId === relation.ownerAppId && value.entityId === relation.entityId);
            try {
                const targetScope = await policy.scope(ctx, { appId: relation.ownerAppId, entityId: relation.entityId, purpose: 'read' });
                const target = registry.get(relation.ownerAppId, relation.entityId);
                const where = and(targetScope.rowPredicate, ...targetScope.currentAuthorityGuards, trustedPredicate(`${identifier(target.idColumn)} IN (SELECT value FROM json_each(?))`, [JSON.stringify(candidates.map(value => value.recordId))]));
                const rows = await db.prepare(`SELECT ${identifier(target.idColumn)} AS id FROM ${identifier(target.table.tableId)} WHERE ${where.sql}`).bind(...where.values).all<{ id: string }>();
                const ids = new Set(rows.results.map(row => row.id)), visible = candidates.filter(value => ids.has(value.recordId));
                return { state: 'value', value: relation.cardinality === 'many' ? visible : visible[0] ?? null };
            } catch (error) {
                if (error instanceof Error && 'code' in error && ['forbidden', 'not_found', 'grant_expired', 'grant_revoked'].includes(String(error.code)))
                    return redacted;
                throw error;
            }
        }
        if (field.type === 'attachment') {
            if (!values.every(value => isFile(value) || isReference(value)))
                return redacted;
            if (!attachments && values.some(isFile))
                throw new AdmissionError('unconfigured', 'Attachment authorization port is required');
            // A store reference is metadata on this record's own field: it follows the row and field authority checked above.
            const visible: ({ fileId: string } | { reference: StoreReference })[] = [];
            for (const member of values)
                if (isReference(member))
                    visible.push(member);
                else if (await attachments!.readable(ctx, member.fileId, ref, fieldId))
                    visible.push({ fileId: member.fileId });
            return { state: 'value', value: visible };
        }
        // Schema changes must not turn old structured references into scalar output.
        return values.some(value => isRef(value) || isFile(value) || isReference(value)) ? redacted : cell;
    };
}
