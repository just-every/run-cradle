import {reconcileEffect} from './reconciliation.server';
import {recordSlotAgreement,reviseScope} from './revisions.server';
import {canonicalHash} from '../../domains/admission/canonical';
import {z} from 'zod';
import type {CommandRegistry} from '../../core/registry/commands';
import {commandSchema} from '../../core/registry/validation';
import type {RequestContext} from '../../domains/authority/ports';
import type {CommandInput} from '../../contracts/primitives';
import {repairActionSchemas,type RepairAction} from './contracts';
import type {RepairDependencies} from './ports';
import {createRepairContext} from './context.server';
import {submitIntake,resolveIdentity,openRepair} from './intake.server';
import {assignContractor,recordQuote,selectQuote} from './quotes.server';
import {requestQuote,bookVisit,cancelVisit} from './effects.server';
import {recordCompletion,storeAcceptance} from './completion.server';
import {recordInvoice,handoffInvoice} from './invoices.server';
import {decide,assignDecision} from '../../domains/decisions/service.server';
import {REPAIRS_APP_ID,REPAIR_ENTITIES} from './model';
const handlers={'repair.reconcile-effect':reconcileEffect,'repair.record-slot-agreement':recordSlotAgreement,'repair.revise-scope':reviseScope, 'intake.submit':submitIntake,'intake.resolve-identity':resolveIdentity,'repair.open':openRepair,'repair.assign-contractor':assignContractor,'repair.request-quote':requestQuote,'repair.record-quote':recordQuote,'repair.select-quote':selectQuote,'repair.book-visit':bookVisit,'repair.cancel-visit':cancelVisit,'repair.record-completion':recordCompletion,'repair.store-acceptance':storeAcceptance,'repair.record-invoice':recordInvoice,'repair.handoff-invoice':handoffInvoice,'decision.outcome':decide,'decision.assign':assignDecision };
export function createRepairActions(d:RepairDependencies){for(const name of ['policy','admission','records','evidence','execution','cases','authoritySelection','intakeClaims'] as const)if(!d[name])throw new Error(`Repair application requires ${name}`);const service={async prepare(ctx:RequestContext,action:RepairAction,command:CommandInput<unknown>){const input=repairActionSchemas[action].parse(command.input);const context=createRepairContext(d,ctx,{...command,input},action);return (handlers[action] as (context:ReturnType<typeof createRepairContext>,input:unknown)=>ReturnType<typeof submitIntake>)(context,input);},async execute(ctx:RequestContext,action:RepairAction,raw:unknown){const command=commandSchema(repairActionSchemas[action]).parse(raw);const replay=await d.admission.replay(ctx,command.commandId,action,REPAIRS_APP_ID,await canonicalHash(command));if(replay)return replay;return d.admission.commit(ctx,await service.prepare(ctx,action,command));}};return service;}
export function registerRepairCommands(registry:CommandRegistry,d:RepairDependencies){const service=createRepairActions(d);for(const action of Object.keys(repairActionSchemas) as RepairAction[]){const input=repairActionSchemas[action];registry.register({action,description:action.replaceAll('.',' ').replaceAll('-',' '),inputSchema:z.toJSONSchema(input) as never,input:commandSchema(input),visible:async ctx=>{try{await d.policy.scope(ctx,{appId:REPAIRS_APP_ID,entityId:action.startsWith('decision.')?REPAIR_ENTITIES.decisions:action.startsWith('intake.')?REPAIR_ENTITIES.intakes:REPAIR_ENTITIES.workOrders,purpose:'read'});return true;}catch{return false;}},replayIdentity:async(_ctx,command)=>({appId:REPAIRS_APP_ID,canonicalInputHash:await canonicalHash(command)}),prepare:(ctx,command)=>service.prepare(ctx,action,command)});}}
