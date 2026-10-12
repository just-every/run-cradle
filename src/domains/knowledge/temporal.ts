import type { CellValue, Ref } from '../../contracts/primitives';
export type TemporalFact={id:string;version:number;ownerId:string;appId:string;kind:'observation'|'source_assertion'|'preference'|'assumption'|'forecast';subject:Ref;predicate:string;value:CellValue;effectiveAt:string;knownAt:string;sourceVersions:{id:string;version:number;sha256:string}[];supersedesVersion:number|null;state:'valid'|'disputed'|'superseded'|'stale';dependencies:string[]};
export function knownAt(facts:TemporalFact[],cutoff:string,effectiveAt:string,ownerId:string){
 const candidates=facts.filter(f=>f.ownerId===ownerId&&Date.parse(f.knownAt)<=Date.parse(cutoff)&&Date.parse(f.effectiveAt)<=Date.parse(effectiveAt));
 const latest=new Map<string,TemporalFact>();for(const fact of candidates){const prev=latest.get(fact.id);if(!prev||fact.version>prev.version)latest.set(fact.id,fact);}return [...latest.values()];
}
export function correctFact(original:TemporalFact,input:{value:CellValue;effectiveAt:string;knownAt:string;sourceVersions:TemporalFact['sourceVersions'];reason:string;actorKind:'human'|'agent'|'connector'|'system'}){
 if(!input.reason.trim()||!input.sourceVersions.length||Date.parse(input.knownAt)<Date.parse(original.knownAt))throw new Error('correction_requires_current_evidence');
 if(original.kind==='preference'&&input.actorKind!=='human')throw new Error('preference_requires_human_authority');
 return {...original,version:original.version+1,value:input.value,effectiveAt:input.effectiveAt,knownAt:input.knownAt,sourceVersions:input.sourceVersions,supersedesVersion:original.version,state:'valid' as const};
}
export type DependencyNode={id:string;dependencies:string[];state:string};
export function invalidationClosure(nodes:DependencyNode[],changedIds:string[]){const changed=new Set(changedIds);let expanded=true;while(expanded){expanded=false;for(const node of nodes)if(!changed.has(node.id)&&node.dependencies.some(x=>changed.has(x))){changed.add(node.id);expanded=true;}}return nodes.filter(x=>changed.has(x.id)).map(x=>x.id);}
