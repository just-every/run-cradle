import type { Snapshot, Choice, BusinessConstraint } from './contracts';
import { snapshotSchema } from './contracts';
import { canonical, digest, q, cmp } from './exact';
const validated=new WeakSet<object>();
function freeze(value:unknown):void{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}}
export function assertValidatedSnapshot(s:Snapshot){if(!validated.has(s))throw new Error('validated_snapshot_required');}
export async function validateSnapshot(input:unknown):Promise<Snapshot>{
 const s=snapshotSchema.parse(input);
 if(Date.parse(s.horizonEnd)-Date.parse(s.cutoff)!==7*24*60*60*1000)throw new Error('seven_day_horizon_required');
 for(const [label,ids] of [['sources',s.sources.map(x=>x.id)],['groups',s.groups],['choices',s.choices.map(x=>x.id)],['constraints',s.constraints.map(x=>x.id)],['resources',s.resources.map(x=>x.id)],['authority',s.authority.map(x=>x.id)]] as const)if(new Set(ids).size!==ids.length)throw new Error(`duplicate_${label}`);
 for(const source of s.sources){if(Date.parse(source.knownAt)>Date.parse(s.cutoff))throw new Error('source_after_cutoff');if(await digest(source.payload)!==source.sha256)throw new Error('source_hash_mismatch');}
 assertPayload(s,s.policyProof,{groups:s.groups,resources:s.resources,budgets:s.budgets,authority:s.authority});
 for(const option of s.choices){if(option.action==='none'&&(option.kind!=='wait'||BigInt(option.cost.minor)!==0n))throw new Error('consequential_choice_requires_action');if(option.action!=='none'&&(!option.subject||!option.actionInputHash))throw new Error('action_subject_and_hash_required');if(!s.groups.includes(option.groupId))throw new Error('unknown_group');if(cmp(q(option.weight),q('0'))<0||cmp(q(option.outageMinutes),q('0'))<0||cmp(q(option.outageMinutes),q('10080'))>0)throw new Error('invalid_outage_units');for(const r of option.resources)if(r.startMinute>=r.endMinute||cmp(q(r.quantity),q('0'))<0||!s.resources.some(x=>x.id===r.resourceId))throw new Error('invalid_resource_interval');assertGrounded(s,option);}
 for(const c of s.constraints){q(c.bound);for(const t of c.terms){q(t.coefficient);if(!s.choices.some(x=>x.id===t.choiceId))throw new Error('unknown_constraint_choice');}assertGrounded(s,c);}
 for(const r of s.resources)if(cmp(q(r.capacity),q('0'))<0)throw new Error('negative_capacity');
 if(new Set(s.budgets.map(x=>x.currency)).size!==s.budgets.length)throw new Error('duplicate_currency_budget');
 for(const a of s.authority)if(!s.sources.some(x=>x.id===a.sourceId))throw new Error('authority_source_missing');
 freeze(s);validated.add(s);return s;
}
export function assertGrounded(s:Snapshot,item:Choice|BusinessConstraint){
 const {proof,...business}=item;assertPayload(s,proof,business);
}
export function assertPayload(s:Snapshot,proof:Choice['proof'],business:unknown){
 const source=s.sources.find(x=>x.id===proof.sourceId&&x.version===proof.version);
 if(!source||Date.parse(source.knownAt)>Date.parse(s.cutoff))throw new Error('ungrounded_source');
 let value:unknown=source.payload;
 for(const key of proof.path){if(value===null||typeof value!=='object'||!Object.hasOwn(value,key))throw new Error('ungrounded_path');value=(value as Record<string|number,unknown>)[key];}
 if(canonical(value)!==canonical(business))throw new Error('source_value_mismatch');
}
