import { baselineMetadata, captureTimelineBaseline, projectTimelineBaseline } from './timeline-baseline.server';
import {timelineZoomSchema} from './timeline-schema';
import { baseAccess, requireBaseAuthor } from './manual/base-access.server';
import { assertGuards } from './fence.server';
import { RECORD_VIEW_ENTITY_ID } from './contracts';
import {validateViewPresentation} from './view-presentation-validation';
import {viewPresentationDefinition} from './view-presentation-schema';
import { viewAccess, requireViewEdit } from './view-access.server';
import { presentationFields } from './view-presentation';
import { visibleCalculationSchema } from './calculation-visibility.server';
import { LAUNCH_APP_ID } from '../../apps/launch/contracts';
import { formMappingKey,type FormActionMapping } from './forms.server';
import { createCursorCodec } from './cursor.server';
import { z } from 'zod';
import type { View, Form, EntitySchema, Query } from './contracts';
import type { RequestContext, PolicyPort } from '../authority/ports';
import type { DescriptorRegistry } from './descriptors.server';
import type { SqlMutation, SqlPredicate } from '../admission/ports';
import { registerTable, eq, and,exists } from '../admission/sql.server';
import { canonical } from '../admission/canonical';
import { idSchema, filterSchema, querySchema } from './validators';
import { createUlid } from '../../core/shared/ids';
import { AdmissionError } from '../admission/errors';
import { filterFields } from './filter.server';
import { createRecordReader } from './query.server';
import { currentSchemaView, currentSchemaForm } from './metadata-schema';
import { formFieldDefinition, validateFormLogic } from './form-definition';
const sortSchema = z.object({ fieldId: idSchema, direction: z.enum(['asc', 'desc']) }).strict();
export const viewDefinition = z.object({...viewPresentationDefinition, access:z.object({canEdit:z.boolean(),canLock:z.boolean()}).strict().optional(), appId: idSchema, entityId: idSchema, name: z.string().trim().min(1).max(200), display: z.enum(['grid', 'cards', 'board', 'calendar', 'timeline', 'agenda']), fields: z.array(idSchema).max(500), filter: filterSchema, sort: z.array(sortSchema).max(10), groupBy: z.array(idSchema).max(5), layout: z.object({ titleFieldId: idSchema, startFieldId: idSchema.optional(), endFieldId: idSchema.optional(), boardFieldId: idSchema.optional(), coverFieldId: idSchema.optional(), dependencyFieldId: idSchema.optional() }).strict(), timelineZoom: timelineZoomSchema.optional(), coverFit: z.enum(['cover','contain']).optional(), visibility: z.enum(['private', 'app']), shipped: z.boolean() }).strict();
export const formDefinition = z.object({ appId: idSchema, entityId: idSchema, title: z.string().min(1).max(200), fields: z.array(formFieldDefinition).max(200), submitAction: z.string().regex(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/), authenticated: z.literal(true) }).strict();
export const viewTable = registerTable('record_views', ['id', 'app_id', 'entity_id', 'owner_id', 'version', 'visibility', 'definition_json', 'created_at', 'updated_at','deleted_at','expires_at']);
export const formTable = registerTable('record_forms', ['id', 'app_id', 'entity_id','owner_id', 'version', 'definition_json', 'created_at', 'updated_at','deleted_at','expires_at']);
type Stored = {
    id: string;
    app_id: string;
    entity_id: string;
    owner_id?: string;
    version: number;
    visibility?: string;
    definition_json: string;
    created_at: string;
    updated_at: string;
    deleted_at?:number|null;expires_at?:number|null;
};
export function createRecordMetadata(db: D1Database, descriptors: DescriptorRegistry, policy: PolicyPort, reader: ReturnType<typeof createRecordReader>, cursorSecret: string) {
    const mappings=new Map<string,FormActionMapping>();
    function registerFormAction(mapping:FormActionMapping){const key=formMappingKey(mapping.appId,mapping.entityId,mapping.action);if(mapping.action==='record.create'||mappings.has(key))throw new Error('Duplicate or reserved form action mapping');mappings.set(key,mapping);}
    function formAction(form:Pick<Form,'appId'|'entityId'|'submitAction'>){if(form.submitAction==='record.create')return null;const mapping=mappings.get(formMappingKey(form.appId,form.entityId,form.submitAction));if(!mapping)throw new AdmissionError('unconfigured','Form action has no installed source mapping');return mapping;}
    async function authorizeForm(ctx:RequestContext,form:Form){const d=descriptors.get(form.appId,form.entityId);try{validateFormLogic(form,d.schema.fields)}catch(error){throw new AdmissionError('validation',(error as Error).message)}const scope=await policy.scope(ctx,{appId:form.appId,entityId:form.entityId,purpose:'read'}),mapping=formAction(form);if(new Set(form.fields.map(f=>f.fieldId)).size!==form.fields.length)throw new AdmissionError('validation','Duplicate form fields');for(const field of form.fields){const storage=d.fields.get(field.fieldId);if(!storage||!scope.readableFieldIds.includes(field.fieldId)&&!scope.writableFieldIds.includes(field.fieldId))throw new AdmissionError('forbidden','Form field is unavailable');if(mapping?!mapping.fieldIds.includes(field.fieldId):!scope.writableFieldIds.includes(field.fieldId)||storage.field.readOnly||storage.field.type==='computed'||d.writePolicy?.create===false||d.writePolicy?.protectedFieldIds?.includes(field.fieldId))throw new AdmissionError('forbidden','Form action does not accept this field');}await policy.authorize(ctx,{appId:form.appId,targetEntityId:form.entityId,action:form.submitAction,fieldIds:form.fields.map(f=>f.fieldId),expected:[],cost:[],inputHash:'0'.repeat(64)});return {scope,d};}
    async function readForm(ctx:RequestContext,id:string){const row=await db.prepare('SELECT * FROM record_forms WHERE id=?').bind(id).first<Stored>();if(!row||row.deleted_at!==null&&row.deleted_at!==undefined)throw new AdmissionError('not_found','Form not found');const storedForm=JSON.parse(row.definition_json) as Form,form=currentSchemaForm(storedForm,descriptors.get(storedForm.appId,storedForm.entityId).schema);if(form.id!==row.id||form.appId!==row.app_id||form.entityId!==row.entity_id||form.version!==row.version)throw new AdmissionError('schema_conflict','Stored form identity mismatch');const {d}=await authorizeForm(ctx,form);return {...form,schema:{...d.schema,fields:d.schema.fields.filter(f=>form.fields.some(item=>item.fieldId===f.id))}};}
    function denied(error:unknown){return error instanceof Error&&'code'in error&&['forbidden','not_found','grant_expired','grant_revoked'].includes(String(error.code));}
    const cursorCodec = createCursorCodec(cursorSecret);
    async function checkedView(ctx: RequestContext, definition: unknown, reading = false): Promise<Omit<View, 'id' | 'version' | 'createdAt' | 'updatedAt'>> { const view = viewDefinition.parse(definition), d = descriptors.get(view.appId, view.entityId), scope = await policy.scope(ctx, { appId: view.appId, entityId: view.entityId, purpose: 'read' });
        // Read-only access hints may round-trip from a read; they never enter the saved definition or authorize a write.
        delete view.access;
        if ((view.layout.coverFieldId || view.coverFit) && !['cards','board'].includes(view.display)) throw new AdmissionError('validation', 'Cover settings require a gallery or board view');
        if (view.layout.coverFieldId) {
            const cover = view.layout.coverFieldId;
            if (d.fields.get(cover)?.field.type !== 'attachment') throw new AdmissionError('validation', 'Gallery cover must be an attachment field');
            if (reading && !scope.readableFieldIds.includes(cover)) { delete view.layout.coverFieldId; view.fields = view.fields.filter(id => id !== cover); }
        }
        if(reading){view.fields=view.fields.filter(id=>scope.readableFieldIds.includes(id));if(view.summaries)view.summaries=view.summaries.filter(item=>scope.readableFieldIds.includes(item.fieldId)&&view.fields.includes(item.fieldId));if(view.formatting)view.formatting=view.formatting.filter(rule=>[...presentationFields(rule.filter),...(rule.fieldId?[rule.fieldId]:[])].every(id=>scope.readableFieldIds.includes(id)&&view.fields.includes(id)));}
        const presentationIds=[...(view.summaries??[]).map(item=>item.fieldId),...(view.formatting??[]).flatMap(rule=>[...presentationFields(rule.filter),...(rule.fieldId?[rule.fieldId]:[])])];
        for(const id of [...view.fields,...view.groupBy,...view.sort.map(item=>item.fieldId),...filterFields(view.filter),...Object.values(view.layout),...presentationIds])if(!d.fields.has(id)||!scope.readableFieldIds.includes(id))throw new AdmissionError('forbidden','View references an unavailable field');
        try{validateViewPresentation(view,d.schema.fields)}catch(error){throw new AdmissionError('validation',(error as Error).message)}
        for (const id of [...view.fields, ...view.groupBy, ...view.sort.map(s => s.fieldId), ...filterFields(view.filter), ...Object.values(view.layout)])
        if (!d.fields.has(id) || !scope.readableFieldIds.includes(id))
            throw new AdmissionError('forbidden', 'View references an unavailable field'); if (['calendar', 'timeline', 'agenda'].includes(view.display)) {
        if (!view.layout.startFieldId || !['date', 'instant'].includes(d.fields.get(view.layout.startFieldId)!.field.type))
            throw new AdmissionError('validation', 'Calendar and timeline need a date field');
        if (view.layout.endFieldId && (d.fields.get(view.layout.endFieldId)!.field.type !== d.fields.get(view.layout.startFieldId)!.field.type)) throw new AdmissionError('validation', 'Start and end fields must have the same date type');
    } if ((view.timelineZoom || view.layout.dependencyFieldId) && view.display !== 'timeline') throw new AdmissionError('validation', 'Timeline settings require a timeline view');
    if (view.layout.dependencyFieldId) { const dependency = d.fields.get(view.layout.dependencyFieldId)?.field; if (dependency?.type !== 'relation' || dependency.relation?.ownerAppId !== view.appId || dependency.relation.entityId !== view.entityId) throw new AdmissionError('validation', 'Timeline dependencies require a linked-record field targeting this table'); }
    if (view.display === 'board' && !view.layout.boardFieldId)
        throw new AdmissionError('validation', 'Board needs a grouping field'); if (view.display === 'board') { const field = d.fields.get(view.layout.boardFieldId!)?.field; if (!field || !['select','person','relation'].includes(field.type) || field.type === 'relation' && field.relation?.cardinality !== 'one') throw new AdmissionError('validation', 'Board columns require a single select, person or single linked-record field'); } return view; }
    async function readView(ctx: RequestContext, id: string): Promise<View> { const row = await db.prepare('SELECT * FROM record_views WHERE id=?').bind(id).first<Stored>(); if (!row || row.visibility === 'deleted' || row.visibility === 'private' && row.owner_id !== ctx.principal.id)
        throw new AdmissionError('not_found', 'View not found'); const storedView = JSON.parse(row.definition_json) as View, v=currentSchemaView(storedView,descriptors.get(storedView.appId,storedView.entityId).schema); return {...v,...await checkedView(ctx, vWithoutVersion(v), true),...(v.timelineBaseline ? {timelineBaseline:{...v.timelineBaseline,records:[]}} : {}),access:await viewAccess(policy,ctx,v,row.owner_id!,'view.save',db).then(({canEdit,canLock})=>({canEdit,canLock}))}; }
    function vWithoutVersion<T extends {
        id: string;
        version: number;
        createdAt: string;
        updatedAt: string;
    }>(v: T) { const { id, version, createdAt, updatedAt, access: _access, timelineBaseline: _baseline, ...definition } = v as T & {access?:unknown;timelineBaseline?:unknown}; return definition; }
    async function prepareView(ctx: RequestContext, definition: unknown, id?: string, version?: number, captureBaseline = false) { const input = await checkedView(ctx, definition), role=ctx.principal.kind==='human'&&ctx.principal.sessionId&&!ctx.principal.credentialId?await baseAccess(db,ctx,input.appId):null; if(role?.role&&input.visibility==='app'&&!['owner','creator','editor'].includes(role.role))throw new AdmissionError('forbidden','Commenters and read-only members may save personal views only.'); const old = id ? await readView(ctx, id) : null; let ownerId=ctx.principal.id,editGuards:SqlPredicate[]=[];if(old){const stored=await db.prepare('SELECT owner_id FROM record_views WHERE id=?').bind(old.id).first<{owner_id:string}>();ownerId=stored!.owner_id;const access=await viewAccess(policy,ctx,old,ownerId,'view.save',db);requireViewEdit(access,!!old.locked!==!!input.locked);editGuards=access.guards;}else if(input.locked){const access=await viewAccess(policy,ctx,{...input,id:createUlid(),version:1},ownerId,'view.save',db);requireViewEdit(access,true);editGuards=access.guards;} if (old && (old.appId !== input.appId || old.entityId !== input.entityId))
        throw new AdmissionError('validation', 'View ownership cannot change'); if (old?.shipped && !input.shipped)
        throw new AdmissionError('validation', 'Shipped identity cannot be removed'); if (old && old.version !== version)
        throw new AdmissionError('version_conflict', 'View changed', old.version); if (!old && input.shipped)
        throw new AdmissionError('forbidden', 'Only source installation creates shipped views'); const now = new Date().toISOString(), view: View = { ...input, id: id ?? createUlid(), version: (old?.version ?? 0) + 1, createdAt: old?.createdAt ?? now, updatedAt: now };
        const storedBaseline = old ? await db.prepare('SELECT definition_json FROM record_views WHERE id=?').bind(old.id).first<{definition_json:string}>() : null;
        const previousBaseline = storedBaseline ? (JSON.parse(storedBaseline.definition_json) as View).timelineBaseline : undefined;
        if (view.display === 'timeline' && previousBaseline?.startFieldId === view.layout.startFieldId && previousBaseline?.endFieldId === view.layout.endFieldId) view.timelineBaseline = previousBaseline;
        const baselineGuards:SqlPredicate[]=[];
        if(captureBaseline){if(!old || view.display!=='timeline')throw new AdmissionError('validation','Save a timeline before capturing its baseline');const capture=await captureTimelineBaseline(ctx,view,reader,policy);view.timelineBaseline=capture.baseline;baselineGuards.push(...capture.guards);}
        const row = { id: view.id, app_id: view.appId, entity_id: view.entityId, owner_id: ownerId, version: view.version, visibility: view.visibility, definition_json: canonical(view), created_at: view.createdAt, updated_at: view.updatedAt }; const scope = await policy.scope(ctx, { appId: view.appId, entityId: view.entityId, purpose: 'read' }); return { value: baselineMetadata(view), audit:[{action:'view.save',subject:{appId:view.appId,entityId:RECORD_VIEW_ENTITY_ID,recordId:view.id},changes:[],sourceIds:[],personalContentRefs:[]}],guards: [...scope.currentAuthorityGuards,...(role?.guards??[]),...editGuards,...baselineGuards], mutations: [old ? { kind: 'update', table: viewTable, set: row, where: and(eq(viewTable, 'id', view.id), eq(viewTable, 'version', old.version)), expectedRows: 1 } : { kind: 'insert', table: viewTable, row }] as SqlMutation[] }; }
    async function viewQuery(ctx: RequestContext, view: View, input: Query) {
        await checkedView(ctx, vWithoutVersion(view), true);
        const scope = await policy.scope(ctx, { appId: view.appId, entityId: view.entityId, purpose: 'read' });
        const groupBy = input.groupBy ?? view.groupBy;
        // Group and layout keys are renderer inputs even when they are hidden columns.
        // The view's visible field list remains unchanged for its CSV export.
        const fields = [...new Set([...(input.fields ?? view.fields), ...groupBy, ...Object.values(view.layout)])];
        const query = querySchema.parse({ ...input, fields, sort: input.sort ?? view.sort, filter: input.filter ? { kind: 'all', conditions: [view.filter, input.filter] } : view.filter, groupBy });
        const records = await reader.query(ctx, scope, query), groups = await reader.groups(ctx, scope, query);
        const workspace = await db.prepare('SELECT timezone FROM workspace_settings LIMIT 1').first<{timezone:string}>();
        if (!workspace && view.display === 'calendar') throw new AdmissionError('unconfigured', 'Workspace timezone is required.');
        const projectedView = {...view};
        if(view.display==='timeline') { const stored = await db.prepare('SELECT version,definition_json FROM record_views WHERE id=?').bind(view.id).first<{version:number;definition_json:string}>(); if(stored&&stored.version!==view.version)throw new AdmissionError('version_conflict','The timeline definition changed. Refresh the saved view.'); const baseline=stored ? (JSON.parse(stored.definition_json) as View).timelineBaseline : undefined; if(baseline) projectedView.timelineBaseline=projectTimelineBaseline(baseline,view,records.items); }
        return { timezone:workspace?.timezone, ...(view.display==='timeline' ? {timelineDependenciesComplete:!view.layout.dependencyFieldId || !!scope.unrestrictedRows && scope.discoverableRelations.includes(view.layout.dependencyFieldId)} : {}), view:projectedView, schema: await visibleCalculationSchema(ctx,{ ...descriptors.get(view.appId, view.entityId).schema, fields: descriptors.get(view.appId, view.entityId).schema.fields.filter(f => scope.readableFieldIds.includes(f.id)).map(f => ({ ...f, readOnly: f.readOnly || !scope.writableFieldIds.includes(f.id) })) },scope,descriptors,policy), records, groups };
    }
    return {
        checkedView, readView, prepareView, viewQuery,readForm,
        async viewHistory(ctx:RequestContext,id:string){
            const view=await readView(ctx,id),scope=await policy.scope(ctx,{appId:view.appId,entityId:view.entityId,purpose:'read'});
            const rows=await db.prepare("SELECT a.id,a.action,a.actor_id,COALESCE(o.name,'Removed operator') AS actor_name,a.created_at FROM admission_audit a LEFT JOIN authority_principals p ON p.id=a.actor_id LEFT JOIN operators o ON o.id=p.human_id WHERE a.app_id=? AND a.subject_json=? ORDER BY a.created_at DESC,a.id DESC LIMIT 100").bind(view.appId,canonical({appId:view.appId,entityId:RECORD_VIEW_ENTITY_ID,recordId:view.id})).all();
            await assertGuards(db,scope.currentAuthorityGuards);await readView(ctx,id);return {items:rows.results};
        },registerFormAction,formAction,
        async formGuard(ctx:RequestContext,id:string){const form=await readForm(ctx,id);return {form,guard:exists(formTable,and(eq(formTable,'id',id),eq(formTable,'version',form.version),eq(formTable,'app_id',form.appId),eq(formTable,'entity_id',form.entityId)))};},
        async forms(ctx:RequestContext,appId:string){const rows=await db.prepare('SELECT id FROM record_forms WHERE app_id=? AND deleted_at IS NULL ORDER BY id').bind(appId).all<{id:string}>();const out:Form[]=[];for(const row of rows.results)try{out.push(await readForm(ctx,row.id));}catch(error){if(!denied(error))throw error;}return out;},
        async page<T extends {
            id: string;
        }>(ctx: RequestContext, items: T[], resource: string, input: {
            limit?: number;
            cursor?: string;
        }) { const limit = input.limit ?? 100; if (!Number.isInteger(limit) || limit < 1 || limit > 200)
            throw new AdmissionError('validation', 'Page limit must be 1–200'); items.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0); const revision = await reader.revision(), binding = await cursorCodec.binding({ resource, actor: ctx.principal.id, epoch: ctx.principal.authenticationEpoch, items }); let offset = 0; if (input.cursor) {
            const parsed = await cursorCodec.decode(input.cursor);
            if (parsed.binding !== binding || parsed.revision !== revision)
                throw new AdmissionError('stale_cursor', 'Metadata or access changed');
            offset = parsed.offset;
        } return { items: items.slice(offset, offset + limit), nextCursor: offset + limit < items.length ? await cursorCodec.encode({ binding, revision, offset: offset + limit }) : null, total: { kind: items.length > 10000 ? 'at_least' as const : 'exact' as const, value: Math.min(items.length, 10000) }, evaluatedAt: new Date().toISOString() }; },
        async apps(ctx: RequestContext) {
            const items: { id: string; name: string; entryUrl: string }[] = [];
            for (const appId of [...new Set(descriptors.list().map(d => d.schema.appId))].sort()) {
                const entities = await this.entities(ctx, appId);
                if (entities.length) items.push({ id: appId, name: (entities.some(e=>e.physicalRevision.startsWith('manual_')) ? (await db.prepare('SELECT name FROM manual_record_bases WHERE id=?').bind(appId).first<{name:string}>())?.name : undefined) ?? (appId===LAUNCH_APP_ID?'Launch readiness':entities.filter(e=>e.label!=='Private source intake').map(entity => entity.label).join(' · ')), entryUrl: `/app/records/${appId}` });
            }
            return items;
        },
        async entities(ctx: RequestContext, appId: string): Promise<EntitySchema[]> { const out: EntitySchema[] = []; for (const d of descriptors.list(appId)) {
            try {
                const scope = await policy.scope(ctx, { appId, entityId: d.schema.id, purpose: 'read' });
                out.push(await visibleCalculationSchema(ctx,{ ...d.schema, fields: d.schema.fields.filter(f => scope.readableFieldIds.includes(f.id) || scope.writableFieldIds.includes(f.id)).map(f => ({ ...f, readOnly: f.readOnly || d.writePolicy?.patch === false || d.writePolicy?.protectedFieldIds?.includes(f.id) || !scope.writableFieldIds.includes(f.id) })) },scope,descriptors,policy));
            }
            catch (error) {
                if (!(error instanceof Error) || !('code' in error) || error.code !== 'forbidden')
                    throw error;
            }
        } return out; },
        async views(ctx: RequestContext, appId: string): Promise<View[]> { const rows = await db.prepare("SELECT id FROM record_views WHERE app_id=? AND (visibility='app' OR (visibility='private' AND owner_id=?)) ORDER BY id").bind(appId, ctx.principal.id).all<{
            id: string;
        }>(); const out: View[] = []; for (const row of rows.results)try{out.push(await readView(ctx,row.id));}catch(error){if(!denied(error))throw error;} return out; },
        async deletedViews(ctx:RequestContext,appId:string){const rows=await db.prepare("SELECT * FROM record_views WHERE app_id=? AND visibility='deleted' AND owner_id=? ORDER BY id").bind(appId,ctx.principal.id).all<Stored>();const out:View[]=[];for(const row of rows.results){const view=JSON.parse(row.definition_json) as View;try{const current=await checkedView(ctx,vWithoutVersion(currentSchemaView(view,descriptors.get(view.appId,view.entityId).schema)));await policy.authorize(ctx,{appId,targetEntityId:view.entityId,action:'view.restore',expected:[],cost:[],inputHash:'0'.repeat(64)});out.push(baselineMetadata({...view,...current,version:row.version}));}catch(error){if(!denied(error))throw error;}}return out;},
        async prepareViewState(ctx: RequestContext, id: string, version: number, restore: boolean) { const row = await db.prepare('SELECT * FROM record_views WHERE id=?').bind(id).first<Stored>(); if (!row)
            throw new AdmissionError('not_found', 'View not found'); if(restore?row.visibility!=='deleted':row.visibility==='deleted')throw new AdmissionError('invalid_transition','View is not in the required state'); const storedView = JSON.parse(row.definition_json) as View, view={...storedView,...await checkedView(ctx, vWithoutVersion(currentSchemaView(storedView,descriptors.get(storedView.appId,storedView.entityId).schema)))}; if (view.shipped && !restore)
            throw new AdmissionError('forbidden', 'Shipped views cannot be deleted'); const access=await viewAccess(policy,ctx,view,row.owner_id!,'view.delete',db);requireViewEdit(access); if (row.version !== version)
            throw new AdmissionError('version_conflict', 'View changed', row.version); if(restore&&row.expires_at!==null&&row.expires_at!==undefined&&row.expires_at<=Date.parse(ctx.now))throw new AdmissionError('invalid_transition','The 30-day view restore window expired.'); if(restore&&await db.prepare("SELECT 1 FROM record_views WHERE app_id=? AND entity_id=? AND id<>? AND visibility<>'deleted' AND lower(json_extract(definition_json,'$.name'))=lower(?)").bind(view.appId,view.entityId,id,view.name).first())throw new AdmissionError('version_conflict','A newer view uses this name; restore would conflict.'); const scope=await policy.scope(ctx,{appId:view.appId,entityId:view.entityId,purpose:'read'});const next = { ...view, version: version + 1, updatedAt: new Date().toISOString() }; return { value: restore ? baselineMetadata(next) : { deletedId: id,appId:view.appId,entityId:view.entityId }, audit:[{action:restore?'view.restore':'view.delete',subject:{appId:view.appId,entityId:RECORD_VIEW_ENTITY_ID,recordId:view.id},changes:[],sourceIds:[],personalContentRefs:[]}], guards: [...scope.currentAuthorityGuards,...access.guards], mutations: [{ kind: 'update', table: viewTable, set: { visibility: restore ? view.visibility : 'deleted',deleted_at:restore?null:Date.parse(ctx.now),expires_at:restore?null:Date.parse(ctx.now)+30*86400000, version: version + 1, definition_json: canonical(next), updated_at: next.updatedAt }, where: and(eq(viewTable, 'id', id), eq(viewTable, 'version', version)), expectedRows: 1 }] as SqlMutation[] }; },
        async prepareForm(ctx: RequestContext, definition: unknown, id?: string, version?: number) { const input = formDefinition.parse(definition), author=await requireBaseAuthor(db,ctx,input.appId), d = descriptors.get(input.appId, input.entityId), scope = await policy.scope(ctx, { appId: input.appId, entityId: input.entityId, purpose: 'read' }); if (input.fields.some(f => !d.fields.has(f.fieldId) || input.submitAction==='record.create'&&!scope.writableFieldIds.includes(f.fieldId)) || input.submitAction==='record.create'&&d.schema.fields.some(f => f.required && f.type !== 'computed' && !input.fields.some(v => v.fieldId === f.id && v.required)))
            throw new AdmissionError('validation', 'Form must expose writable required fields'); await authorizeForm(ctx,{...input,id:id??createUlid(),version:version??1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}); const old = id ? await db.prepare('SELECT * FROM record_forms WHERE id=?').bind(id).first<Stored>() : null; if (old && (old.app_id !== input.appId || old.entity_id !== input.entityId))
            throw new AdmissionError('validation', 'Form ownership cannot change'); if (id && !old)
            throw new AdmissionError('not_found', 'Form not found'); if (old && old.version !== version)
            throw new AdmissionError('version_conflict', 'Form changed', old.version); if(old?.deleted_at!==null&&old?.deleted_at!==undefined)throw new AdmissionError('invalid_transition','Restore the deleted form before editing it.'); const now = new Date().toISOString(), form: Form = { ...input, id: id ?? createUlid(), version: (old?.version ?? 0) + 1, createdAt: old?.created_at ?? now, updatedAt: now }; const row = { id: form.id, app_id: form.appId, entity_id: form.entityId,owner_id:old?.owner_id??ctx.principal.id, version: form.version, definition_json: canonical(form), created_at: form.createdAt, updated_at: now }; return { value: form, guards: [...scope.currentAuthorityGuards,...(author?.guards??[])], mutations: [old ? { kind: 'update', table: formTable, set: row, where: and(eq(formTable, 'id', form.id), eq(formTable, 'version', old.version)), expectedRows: 1 } : { kind: 'insert', table: formTable, row }] as SqlMutation[] }; }
    };
}
