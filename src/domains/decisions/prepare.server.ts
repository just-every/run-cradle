import {z} from 'zod';
import {idSchema,revisionSchema} from '../../core/registry/validation';
import {link} from '../evidence/validators';
import {createUlid} from '../../core/shared/ids';
import {canonicalHash} from '../admission/canonical';
import {AdmissionError} from '../admission/errors';
import {decisionDTO} from './service.server';
import type {RepairContext} from '../../apps/repairs/context.server';
import {money} from '../../apps/repairs/contracts';
import {REPAIRS_APP_ID} from '../../apps/repairs/model';
const text=z.string().trim().min(1).max(10000);
export const businessDecisionInput=z.object({kind:z.enum(['strategy','grant','release','case']),requester:z.object({id:idSchema,kind:z.enum(['human','agent','connector','system'])}).strict(),assigneeId:idSchema,subject:revisionSchema,proposalId:idSchema.nullable(),recommendation:text,alternatives:z.array(text).min(1).max(20),consequence:text,spend:z.array(money).max(20),commitments:z.array(text).max(20),evidence:z.array(link).min(1).max(100),unknowns:z.array(text).max(20),expiresAt:z.iso.datetime(),supersedesId:idSchema.nullable()}).strict();
/** Called by source-owned preparation under its admission context, never creates authority. */
export async function prepareBusinessDecision(c:RepairContext,raw:unknown){const input=businessDecisionInput.parse(raw);if(input.subject.ref.appId!==REPAIRS_APP_ID)throw new AdmissionError('forbidden','Decision subject belongs to another app');if(input.expiresAt<=c.ctx.now)throw new AdmissionError('validation','Decision expiry must be in the future');await c.evidence(input.evidence);const id=createUlid(),values={kind:input.kind,requester_id:input.requester.id,requester_kind:input.requester.kind,assignee_id:input.assigneeId,subject_json:JSON.stringify(input.subject),exact_input_hash:await canonicalHash(input),recommendation:input.recommendation,alternatives:JSON.stringify(input.alternatives),impact:JSON.stringify({summary:input.consequence,spend:input.spend,commitments:input.commitments,affected:[input.subject.ref],accessChanges:[],egress:[],uncertainty:input.unknowns}),evidence:JSON.stringify(input.evidence),freshness:JSON.stringify({asOf:c.ctx.now,sourcesKnown:new Set(input.evidence.map(e=>e.sourceId)).size,sourcesExpected:null,staleSourceIds:[],unknowns:input.unknowns}),due_at:input.expiresAt,expires_at:input.expiresAt,rationale:null,decided_by:null,decided_at:null,supersedes_id:input.supersedesId,proposal_id:input.proposalId,lifecycle:'awaiting'};c.insert('decisions',id,values);return decisionDTO({id,version:1,created_at:c.ctx.now,updated_at:c.ctx.now,schema_version:1,...values});}
