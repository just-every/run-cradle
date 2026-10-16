import type {SqlPredicate,SqlScalar} from '../../domains/admission/ports'
import {bindExpression} from '../../domains/admission/batch.server'
/** Repeated authority fences share their bindings instead of exhausting D1's parameter limit. */
export function sharedBindings(){
 const values:SqlScalar[]=[]
 const bind=(value:SqlScalar)=>{let index=values.findIndex(existing=>Object.is(existing,value));if(index<0){index=values.length;values.push(value)}return `?${index+1}`}
 return{values,bind,predicate:(guard:SqlPredicate)=>bindExpression(guard.sql,index=>bind(guard.values[index]!))}
}
