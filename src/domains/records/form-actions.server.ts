import {z} from 'zod';
import { visibleFormFields } from './form-logic';
import type {CommandRegistry} from '../../core/registry/commands';
import type {Json,CommandInput} from '../../contracts/primitives';
import type {PolicyPort} from '../authority/ports';
import type {createRecordMetadata} from './metadata.server';
import type {FormActionMapping,FormCreatePreparer} from './forms.server';
import {RECORD_FORM_ENTITY_ID,RECORD_SCHEMA_ENTITY_ID} from './contracts';
import {idSchema,refSchema,cellValueSchema,validateCell} from './validators';
import {canonicalHash} from '../admission/canonical';
import {AdmissionError} from '../admission/errors';
const inputSchema=z.object({appId:idSchema,entityId:idSchema,formId:idSchema,values:z.record(idSchema,cellValueSchema),templateId:idSchema.optional()}).strict();
const envelope=z.object({commandId:idSchema,input:inputSchema,expected:z.array(z.object({ref:refSchema,version:z.number().int().positive()}).strict()),controlEpoch:z.number().int().nonnegative().optional()}).strict();
export function registerRecordFormActions(registry:CommandRegistry,deps:{metadata:ReturnType<typeof createRecordMetadata>;policy:PolicyPort;prepareCreate:FormCreatePreparer;customMappings?:readonly FormActionMapping[];templates?:ReturnType<typeof import('./templates/service.server').createRecordTemplates>}){
 for(const mapping of deps.customMappings??[])deps.metadata.registerFormAction(mapping);
 registry.register({action:'form.submit',description:'Submit the current authorized fields of a saved form',input:envelope,inputSchema:z.toJSONSchema(envelope) as Json,visible:async()=>true,replayIdentity:async(_ctx,command)=>({appId:command.input.appId,canonicalInputHash:await canonicalHash({action:'form.submit',input:command.input,expected:command.expected,controlEpoch:command.controlEpoch??null})}),async prepare(ctx,command){
  const {form,guard}=await deps.metadata.formGuard(ctx,command.input.formId);
  if(form.appId!==command.input.appId||form.entityId!==command.input.entityId)throw new AdmissionError('validation','Form belongs to another app or entity');
  const version=command.expected.find(e=>e.ref.appId===form.appId&&e.ref.entityId===RECORD_FORM_ENTITY_ID&&e.ref.recordId===form.id);if(version?.version!==form.version)throw new AdmissionError('version_conflict','Current form version is required',form.version);
  const schemaVersion=command.expected.find(e=>e.ref.appId===form.appId&&e.ref.entityId===RECORD_SCHEMA_ENTITY_ID&&e.ref.recordId===form.entityId);if(schemaVersion?.version!==form.schema.version)throw new AdmissionError('schema_conflict','Current form schema version is required');
  const allowed=new Set(form.fields.map(f=>f.fieldId));for(const id of Object.keys(command.input.values))if(!allowed.has(id))throw new AdmissionError('validation','Submitted field is not advertised by this form');
  const visible=visibleFormFields(form,form.schema.fields,command.input.values),visibleIds=new Set(visible.map(f=>f.fieldId));for(const id of Object.keys(command.input.values))if(!visibleIds.has(id))throw new AdmissionError('validation','A hidden form field cannot be submitted');
  for(const field of visible){const value=command.input.values[field.fieldId];if(field.required&&(value===undefined||value===null||value===''||Array.isArray(value)&&!value.length))throw new AdmissionError('validation',`${field.label} is required.`);if(value!==undefined)validateCell(form.schema.fields.find(f=>f.id===field.fieldId)!,value);}
  const expected=command.expected.filter(e=>e.ref.entityId!==RECORD_FORM_ENTITY_ID),base={commandId:command.commandId,expected,controlEpoch:command.controlEpoch};
  const mapping=deps.metadata.formAction(form);let target;
  if(command.input.templateId){if(mapping||!deps.templates||form.submitAction!=='record.create')throw new AdmissionError('validation','Templates require an ordinary record form.');target=await deps.templates.apply(ctx,{...base,input:{appId:form.appId,entityId:form.entityId,templateId:command.input.templateId,values:command.input.values}},visibleIds);}
  else if(mapping){const input=mapping.input.parse(mapping.map({form,values:command.input.values,expected}));target=await mapping.prepare(ctx,{...base,input});}
  else target=await deps.prepareCreate(ctx,{...base,input:{appId:form.appId,entityId:form.entityId,values:command.input.values}});
  const targetAction=command.input.templateId?'record.apply-template':form.submitAction;
  if(target.commandId!==command.commandId||target.appId!==form.appId||target.action!==targetAction||target.permit.action!==targetAction)throw new AdmissionError('internal','Source form mapping returned a different command identity');
  const hash=await canonicalHash({action:'form.submit',input:command.input,expected:command.expected,controlEpoch:command.controlEpoch??null}),permit=await deps.policy.authorize(ctx,{appId:form.appId,targetEntityId:form.entityId,action:'form.submit',fieldIds:Object.keys(command.input.values),expected,cost:[],inputHash:hash,commandId:command.commandId});
  return {...target,action:'form.submit',canonicalInputHash:hash,permit,guards:[guard,...target.guards,...target.permit.guards],mutations:[...target.mutations,...target.permit.reservationMutations]};
 }});
}
