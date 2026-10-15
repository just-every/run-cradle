import {z} from 'zod';
import {idSchema as id,refSchema as ref,revisionSchema as revision} from '../../core/registry/validation';
import {link} from '../../domains/evidence/validators';
import {cellValueSchema} from '../../domains/records/validators';
import type {Versioned,Ref,RevisionRef,Money,Failure} from '../../contracts/primitives';
import type {EvidenceLink} from '../../domains/evidence/contracts';
import type {RecordRow} from '../../domains/records/contracts';
export type Intake=Versioned&{sourceIds:string[];appId:string;state:'received'|'extracting'|'needs_identity'|'needs_review'|'ready'|'admitted'|'duplicate'|'failed';claimIds:string[];candidates:{ref:Ref;reasons:string[]}[];exactIdentity:Ref|null;duplicateOf:string|null;caseId:string|null;question:{text:string;recipientId:string;reusedEvidence:EvidenceLink[]}|null;failure:Failure['error']|null};
export type Quote=Versioned&{workOrder:RevisionRef;contractor:RevisionRef;scopeHash:string;total:Money;taxIncluded:boolean;lineItems:{description:string;total:Money}[];exclusions:string[];expiresAt:string;evidence:EvidenceLink[];offeredSlot:{start:string;end:string;expiresAt:string;state:'offered'}|null;state:'received'|'selected'|'rejected'|'superseded'|'expired';approvalId:string|null};
export type RepairCase={id:string;state:string;controlEpoch:number;[key:string]:unknown};
export type Repair={workOrder:RecordRow;stage:'identity'|'triage'|'quotes'|'approval'|'booking'|'work'|'store_acceptance'|'accounting'|'verified'|'rework'|'dispute';case:RepairCase;quotes:Quote[];visitIds:string[];completionClaimIds:string[];storeAcceptance:{claimId:string;claimVersion:number;actorId:string;accepted:boolean;reason:string|null;at:string}|null;accounting:{state:'not_ready'|'unconfigured'|'pending'|'unknown'|'handed_off'|'refused';receiptId:string|null;externalId:string|null};blockers:string[]};
export const instant=z.iso.datetime(),money=z.object({minor:z.string().regex(/^(0|[1-9][0-9]*)$/).max(40),currency:z.string().regex(/^[A-Z]{3}$/),scale:z.number().int().min(0).max(6)}).strict();
export const evidence=z.array(link).min(1).max(100);
const slot=z.object({start:instant,end:instant}).strict().refine(v=>v.start<v.end,'Slot end must follow start');
const offered=z.object({start:instant,end:instant,expiresAt:instant,state:z.literal('offered')}).strict().refine(v=>v.start<v.end,'Slot end must follow start');
const text=z.string().trim().min(1).max(10000),hash=z.string().regex(/^[a-f0-9]{64}$/);
export const repairActionSchemas={
 'intake.submit':z.object({appId:id,formId:id,values:z.record(id,cellValueSchema),text,fileIds:z.array(id).max(20),sourceId:id.optional()}).strict(),
 'intake.resolve-identity':z.object({intakeId:id,identity:ref,evidence,reason:text}).strict(),
 'repair.open':z.object({intakeId:id,asset:revision,store:revision,sourceVersions:z.array(z.object({id,version:z.number().int().positive()}).strict()).max(100).optional(),mandate:z.object({id,version:z.number().int().positive()}).strict().optional()}).strict(),
 'repair.assign-contractor':z.object({workOrder:revision,contractor:revision,eligibilityEvidence:evidence}).strict(),
 'repair.request-quote':z.object({workOrder:revision,contractor:revision,scopeHash:hash,connectionId:id}).strict(),
 'repair.record-quote':z.object({workOrder:revision,contractor:revision,scopeHash:hash,total:money,taxIncluded:z.boolean(),lineItems:z.array(z.object({description:text,total:money}).strict()).min(1).max(100),exclusions:z.array(text).max(100),expiresAt:instant,evidence,offeredSlot:offered.nullable()}).strict(),
 'repair.select-quote':z.object({quoteId:id}).strict(),
 'repair.record-slot-agreement':z.object({quoteId:id,slot,timezone:z.string().min(1).max(100).refine(v=>{try{new Intl.DateTimeFormat('en',{timeZone:v});return true;}catch{return false;}},'Valid IANA timezone required'),evidence}).strict(),
 'repair.revise-scope':z.object({workOrder:revision,description:text,evidence}).strict(),
 'repair.book-visit':z.object({quoteId:id,slot,connectionId:id,approvalId:id.nullable()}).strict(),
 'repair.reconcile-effect':z.discriminatedUnion('kind',[z.object({kind:z.literal('visit'),id}).strict(),z.object({kind:z.literal('handoff'),id}).strict()]),
 'repair.cancel-visit':z.object({visitId:id,reason:text,connectionId:id}).strict(),
 'repair.record-completion':z.object({workOrder:revision,visitId:id,reopensAcceptanceId:id.optional(),sourceIds:z.array(id).min(1).max(100),evidence}).strict(),
 'repair.store-acceptance':z.object({workOrder:revision,claimId:id,claimVersion:z.number().int().positive(),accepted:z.boolean(),reason:z.string().trim().max(10000),evidence}).strict().refine(v=>v.accepted||v.reason.length>0,'Explain required rework'),
 'repair.record-invoice':z.object({workOrder:revision,sourceId:id,sourceVersion:z.number().int().positive(),invoiceNumber:text,invoiceDate:z.iso.date(),dueDate:z.iso.date(),lineAmountTypes:z.enum(['Inclusive','Exclusive','NoTax']),lines:z.array(z.object({description:text,quantity:z.string().regex(/^[0-9]+(?:\.[0-9]+)?$/),unitAmount:z.string().regex(/^[0-9]+(?:\.[0-9]+)?$/),lineAmount:z.string().regex(/^[0-9]+(?:\.[0-9]+)?$/),accountCode:text,taxType:text}).strict()).min(1).max(100),payeeId:text,total:money,scopeHash:hash,evidence}).strict(),
 'repair.handoff-invoice':z.object({workOrder:revision,invoiceSourceId:id,quoteId:id,acceptanceId:id,connectionId:id}).strict(),
 'decision.outcome':z.object({decisionId:id,outcome:z.enum(['approve','reject','request_change','cancel']),rationale:z.string().trim().max(10000),confirmedInputHash:hash}).strict().refine(v=>v.outcome==='approve'||!!v.rationale,'Rationale is required'),
 'decision.assign':z.object({decisionId:id,assigneeId:id}).strict(),
} as const;
export type RepairAction=keyof typeof repairActionSchemas;
export type RepairActionInput<A extends RepairAction>=z.infer<(typeof repairActionSchemas)[A]>;
export type IntakeContext={appId:string;formId:string;entityId:string;fieldIds:{text:string;store:string;asset:string};stores:{ref:Ref;version:number;name:string}[];assets:{ref:Ref;version:number;storeId:string;name:string;serial:string|number|null|undefined}[];photoUpload:{state:'ready';subject:Ref;fieldIds:string[];uploadAction:string;captureAction:string}|{state:'needs_store';message:string}};
export type DecisionReview={controlEpoch?:number;decision:import('../../domains/decisions/contracts').Decision;quote:(Quote&{payee:{id:string;label:string};contractor:{id:string;version:number;name:string};scope:{hash:string;description:string;lineItems:Quote['lineItems']}})|null;expected?:RevisionRef[]};
export type CompletionReview={controlEpoch:number;workOrder:RevisionRef;claim:{id:string;version:number;scopeHash:string;visitId:string;sourceIds:string[];evidence:EvidenceLink[];createdAt:string};store:{id:string;name:string};contractor:{id:string;name:string}|null;accepted:boolean|null};
