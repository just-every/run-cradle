import { describeRecordConflict } from './conflict.server';
import { z } from 'zod';
import type { CommandRegistry } from '../../core/registry/commands';
import type { CommandInput, Json, RevisionRef, CellValue } from '../../contracts/primitives';
import type { PolicyPort, RequestContext, AuthorizationRequest } from '../authority/ports';
import type { AdmissionPlan } from '../admission/ports';
import type { DescriptorRegistry } from './descriptors.server';
import { RECORD_SCHEMA_ENTITY_ID, RECORD_VIEW_ENTITY_ID, RECORD_FORM_ENTITY_ID } from './contracts';
import { idSchema, refSchema, cellValueSchema, querySchema } from './validators';
import { createRecordReader } from './query.server';
import { createRecordWriter } from './change.server';
import { createRecordMetadata, viewDefinition, formDefinition } from './metadata.server';
import { createBulkService } from './bulk.server';
import { canonicalHash } from '../admission/canonical';
import { AdmissionError } from '../admission/errors';
import { createRangePatchPreparer, rangePatchSchema } from './range.server';
const expectedSchema = z.array(z.object({ ref: refSchema, version: z.number().int().positive() }).strict()).max(500);
const envelope = <T extends z.ZodType>(input: T) => z.object({ commandId: idSchema, expected: expectedSchema, controlEpoch: z.number().int().nonnegative().optional(), input }).strict();
export type RecordActionDependencies = {
    policy: PolicyPort;
    descriptors: DescriptorRegistry;
    reader: ReturnType<typeof createRecordReader>;
    writer: ReturnType<typeof createRecordWriter>;
    metadata: ReturnType<typeof createRecordMetadata>;
    bulk: ReturnType<typeof createBulkService>;

};
export function registerRecordActions(registry: CommandRegistry, deps: RecordActionDependencies) {
    const { policy, descriptors, writer, metadata, bulk } = deps;
    function register<T>(action: string, input: z.ZodType<T>, prepare: (ctx: RequestContext, command: CommandInput<T>) => Promise<AdmissionPlan<unknown>>, describeConflict?: (ctx: RequestContext, command: CommandInput<T>, error: Error) => Promise<Error>) { const validator = envelope(input); registry.register({ action, description: action.replaceAll('.', ' '), input: validator, inputSchema: z.toJSONSchema(validator) as Json, visible: async () => true, replayIdentity: async (ctx, command) => { const input = command.input as Record<string, unknown>; const ref = input.ref as {
            appId?: string;
        } | undefined; const definition = (input.view ?? input.form ?? input.definition) as {
            appId?: string;
        } | undefined; let appId = typeof input.appId === 'string' ? input.appId : ref?.appId ?? definition?.appId ?? command.expected[0]?.ref.appId; if (!appId && typeof input.previewId === 'string')
            appId = await bulk.replayApp(ctx, input.previewId, 'preview'); if (!appId && typeof input.undoId === 'string')
            appId = await bulk.replayApp(ctx, input.undoId, 'undo'); if (!appId)
            throw new AdmissionError('validation', 'Command app identity is required'); return { appId, canonicalInputHash: await canonicalHash({ action, input: command.input, expected: command.expected, controlEpoch: command.controlEpoch ?? null }) }; }, prepare, describeConflict }); }
    function expected(command: CommandInput<unknown>, ref: {
        appId: string;
        entityId: string;
        recordId: string;
    }) { const e = command.expected.find(e => e.ref.appId === ref.appId && e.ref.entityId === ref.entityId && e.ref.recordId === ref.recordId); if (!e)
        throw new AdmissionError('validation', 'Current expected version is required'); return e.version; }
    async function plan<T>(ctx: RequestContext, command: CommandInput<unknown>, action: string, appId: string, value: T, change: {
        guards: AdmissionPlan<T>['guards'];
        mutations: AdmissionPlan<T>['mutations'];
        audit?: AdmissionPlan<T>['audit'];
        changed?: RevisionRef[];
        authorityAction?:string;
        authorization?: Pick<AuthorizationRequest, 'expected' | 'fieldIds' | 'targetEntityId' | 'proposedRows'>;
    }): Promise<AdmissionPlan<T>> { const hash = await canonicalHash({ action, input: command.input, expected: command.expected, controlEpoch: command.controlEpoch ?? null }), permit = await policy.authorize(ctx, { appId, action:change.authorityAction??action, expected: command.expected, cost: [], inputHash: hash, commandId: command.commandId, ...change.authorization }); return { commandId: command.commandId, action, appId, canonicalInputHash: hash, permit:{...permit,action}, guards: change.guards, mutations: change.mutations, audit: change.audit ?? [], events: [], outbox: [], committedResult: value, changed: change.changed }; }
    register('record.create', z.object({ appId: idSchema, entityId: idSchema, values: z.record(idSchema, cellValueSchema) }).strict(), createAuthorizedRecordCreatePreparer(deps));
    const rangePatch = createRangePatchPreparer(deps);
    register('record.patch', z.union([z.object({ ref: refSchema, changes: z.record(idSchema, cellValueSchema) }).strict(), rangePatchSchema]), async (ctx, c) => { if ('rows' in c.input) return rangePatch(ctx, { ...c, input: c.input }); const scope = await policy.scope(ctx, { appId: c.input.ref.appId, entityId: c.input.ref.entityId, purpose: 'read' }), p = await writer.prepareChange(ctx, scope, { ...c.input, expectedVersion: expected(c, c.input.ref) }); return plan(ctx, c, 'record.patch', c.input.ref.appId, p.next, { ...p, authorization: { expected: [{ref:c.input.ref,version:expected(c,c.input.ref)}], fieldIds:Object.keys(c.input.changes) }, changed: [{ ref: p.next.ref, version: p.next.version }] }); }, describeRecordConflict(deps));
    const evidence = z.object({ sourceId: idSchema, sourceVersion: z.number().int().positive(), locator: z.union([z.object({ kind: z.literal('text'), start: z.number().int().nonnegative(), end: z.number().int().nonnegative() }).strict(), z.object({ kind: z.literal('page'), page: z.number().int().positive(), region: z.array(z.number()).optional() }).strict(), z.object({ kind: z.literal('field'), path: z.string() }).strict()]), observedAt: z.string() }).strict();
    register('record.transition', z.object({ ref: refSchema, transition: z.string().min(1).max(100), reason: z.string().min(1).max(4000), evidence: z.array(evidence).max(100) }).strict(), async (ctx, c) => { const scope = await policy.scope(ctx, { appId: c.input.ref.appId, entityId: c.input.ref.entityId, purpose: 'read' }), p = await writer.prepareTransition(ctx, scope, c.input.ref, expected(c, c.input.ref), c.input.transition); const result = await plan(ctx, c, 'record.transition', c.input.ref.appId, p.next, { ...p, changed: [{ ref: p.next.ref, version: p.next.version }] }); const transition = await policy.authorize(ctx, { appId: c.input.ref.appId, action: c.input.transition, transition: c.input.transition, expected: c.expected, cost: [], inputHash: result.canonicalInputHash, commandId: c.commandId }); result.guards = [...result.guards, ...transition.guards]; result.mutations = [...result.mutations, ...transition.reservationMutations]; return result; });
    register('record.delete', z.object({ ref: refSchema, confirmation: z.string() }).strict(), async (ctx, c) => { if (c.input.confirmation !== c.input.ref.recordId)
        throw new AdmissionError('validation', 'Confirm deletion using the exact record ID'); const scope = await policy.scope(ctx, { appId: c.input.ref.appId, entityId: c.input.ref.entityId, purpose: 'read' }), p = await writer.prepareDelete(ctx, scope, c.input.ref, expected(c, c.input.ref)); return plan(ctx, c, 'record.delete', c.input.ref.appId, { deleted: c.input.ref, trashUntil:new Date(Date.parse(ctx.now)+30*86400000).toISOString() }, p); });
    register('record.bulk-preview', z.object({ appId: idSchema, entityId: idSchema, selection: z.union([z.object({ ids: z.array(idSchema).max(500) }).strict(), z.object({ query: querySchema }).strict()]), change: z.union([z.object({ fieldId: idSchema, value: cellValueSchema }).strict(), z.object({ transition: z.string().min(1) }).strict()]) }).strict(), bulk.preview);
    register('record.bulk-commit', z.object({ previewId: idSchema, token: z.string().max(20000) }).strict(), bulk.commit);
    register('record.undo', z.object({ undoId: idSchema }).strict(), bulk.undo);
    register('view.save', z.object({ view: viewDefinition, id: idSchema.optional(), captureBaseline: z.boolean().optional() }).strict(), async (ctx, c) => { const p = await metadata.prepareView(ctx, c.input.view, c.input.id, c.input.id ? expected(c, { appId: c.input.view.appId, entityId: RECORD_VIEW_ENTITY_ID, recordId: c.input.id }) : undefined, c.input.captureBaseline); return plan(ctx, c, 'view.save', p.value.appId, p.value, p); });
    for (const action of ['view.delete', 'view.restore'])
        register(action, z.object({ viewId: idSchema }).strict(), async (ctx, c) => { const version = c.expected.find(e => e.ref.entityId === RECORD_VIEW_ENTITY_ID && e.ref.recordId === c.input.viewId); if (!version)
            throw new AdmissionError('validation', 'View version required'); const p = await metadata.prepareViewState(ctx, c.input.viewId, version.version, action === 'view.restore'); if(version.ref.appId!==p.value.appId)throw new AdmissionError('forbidden','View belongs to another app'); return plan(ctx, c, action, p.value.appId, p.value, {...p,authorityAction:'view.delete'}); });
    register('view.preview', z.object({ definition: viewDefinition, query: querySchema }).strict(), async (ctx, c) => { const definition = await metadata.checkedView(ctx, c.input.definition), now = new Date().toISOString(), value = await metadata.viewQuery(ctx, { ...definition, id: c.commandId, version: 1, createdAt: now, updatedAt: now }, c.input.query); return plan(ctx, c, 'view.preview', definition.appId, value, { guards: [], mutations: [] }); });
    register('form.save', z.object({ form: formDefinition, id: idSchema.optional() }).strict(), async (ctx, c) => { const p = await metadata.prepareForm(ctx, c.input.form, c.input.id, c.input.id ? expected(c, { appId: c.input.form.appId, entityId: RECORD_FORM_ENTITY_ID, recordId: c.input.id }) : undefined); return plan(ctx, c, 'form.save', p.value.appId, p.value, p); });
}

/** Shared by direct create and saved forms; the schema revision is a guard, not an authorization subject. */
export function createAuthorizedRecordCreatePreparer(deps: Pick<RecordActionDependencies, 'policy' | 'descriptors' | 'writer'>) {
 return async (ctx: RequestContext, command: CommandInput<{appId:string;entityId:string;values:Record<string,CellValue>}>): Promise<AdmissionPlan<unknown>> => {
  const {appId,entityId,values}=command.input, descriptor=deps.descriptors.get(appId,entityId);
  if(!command.expected.some(e=>e.ref.appId===appId&&e.ref.entityId===RECORD_SCHEMA_ENTITY_ID&&e.ref.recordId===descriptor.schema.id&&e.version===descriptor.schema.version))throw new AdmissionError('schema_conflict','Current schema version required');
  const scope=await deps.policy.scope(ctx,{appId,entityId,purpose:'read'}), change=await deps.writer.prepareCreate(ctx,scope,values);
  const insertion=change.mutations.find(m=>m.kind==='insert'&&m.table.tableId===descriptor.table.tableId);
  if(!insertion||insertion.kind!=='insert')throw new Error('Record insertion is missing');
  const action='record.create',hash=await canonicalHash({action,input:command.input,expected:command.expected,controlEpoch:command.controlEpoch??null});
  const permit=await deps.policy.authorize(ctx,{appId,action,expected:[],targetEntityId:entityId,proposedRows:[{entityId,row:insertion.row}],fieldIds:change.audit.flatMap(fact=>fact.changes.map(value=>value.fieldId)),cost:[],inputHash:hash,commandId:command.commandId});
  return {commandId:command.commandId,action,appId,canonicalInputHash:hash,permit,guards:change.guards,mutations:change.mutations,audit:change.audit,events:[],outbox:[],committedResult:change.next,changed:[{ref:change.next.ref,version:change.next.version}]};
 };
}
