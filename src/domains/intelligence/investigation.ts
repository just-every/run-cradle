import { q, cmp, add, mul, sub, fmt } from './exact';
export type InvestigationInput={unit:string;actNowCost:string;investigationCost:string;delayCost:string;disruptionCost:string;budgetRemaining:string;probabilityEvidenceIds:string[];answers:{answer:string;probability:string;bestCostAfterAnswer:string;strategyIds:string[]}[]};
export function valueOfInformation(input:InvestigationInput){
 if(!input.unit||!input.answers.length)throw new Error('investigation_answers_and_unit_required');
 const numbers=[input.actNowCost,input.investigationCost,input.delayCost,input.disruptionCost,input.budgetRemaining,...input.answers.flatMap(a=>[a.probability,a.bestCostAfterAnswer])];if(numbers.some(x=>cmp(q(x),q('0'))<0))throw new Error('negative_investigation_value');
 const probability=input.answers.reduce((a,x)=>add(a,q(x.probability)),q('0'));if(cmp(probability,q('1'))!==0)throw new Error('probabilities_must_sum_to_one');
 if(input.answers.some(x=>!x.strategyIds.length))throw new Error('answer_requires_decision_effect');
 const expected=input.answers.reduce((a,x)=>add(a,mul(q(x.probability),q(x.bestCostAfterAnswer))),q('0'));
 const cost=add(add(q(input.investigationCost),q(input.delayCost)),q(input.disruptionCost));
 const value=sub(q(input.actNowCost),add(expected,cost));
 const supported=input.probabilityEvidenceIds.length>0;
 return{expectedNetValue:fmt(value),unit:input.unit,decision:!supported?'conditional':cmp(q(input.investigationCost),q(input.budgetRemaining))>0?'budget_exhausted':cmp(value,q('0'))>0?'investigate':'act_now',possibleAnswers:input.answers,assumptions:supported?[]:['Answer probabilities lack evidence; expected value is conditional.'],authorityGranted:false};
}
export type CausalClaim={kind:'forecast'|'association'|'causal';claim:string;evidenceIds:string[];identification:string|null;confounders:string[];design?:{population:string;comparison:string;outcomeWindow:string;stoppingRule:string;independentReviewId:string;assumptions:string[]}};
export function assessCausalClaim(claim:CausalClaim){
 if(claim.kind!=='causal')return{state:'noncausal' as const,reason:'Prediction or association cannot establish an intervention effect.'};
 if(!claim.identification?.trim()||!claim.evidenceIds.length||!claim.design||!claim.design.independentReviewId||Object.values(claim.design).some(x=>typeof x==='string'&&!x.trim()))return{state:'investigate' as const,reason:'Identification, independent review, comparison, population, outcome window and stopping rule are required.',questions:['Could assignment to harder cases explain this association?','Which evidence distinguishes the proposed mechanism from selection effects?']};
 return{state:'reviewable' as const,reason:'Identification argument recorded for independent adjudication; no automatic causal fact or policy.'};
}
