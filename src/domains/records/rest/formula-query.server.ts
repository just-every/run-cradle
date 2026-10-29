import type {Page} from '../../../contracts/primitives'
import type {PolicyScope,RequestContext} from '../../authority/ports'
import {assertCurrentScopeAuthority} from '../../authority/guards.server'
import {AdmissionError} from '../../admission/errors'
import type {RecordRow,Expr} from '../contracts'
import type {createRecordServices} from '../service.server'
import {createCursorCodec} from '../cursor.server'
import {parseFormula,FormulaSyntaxError} from '../formula-parser'
import {evaluateExpression} from '../formulas'
import {truthy} from '../formula-values'
import type {RestQueryInput} from './contracts'

type Services=ReturnType<typeof createRecordServices>
/** Formula predicates reuse the native row reader and the shipped formula language. */
export function createFormulaQuery(db:D1Database,services:Services,cursorSecret:string){
 const cursor=createCursorCodec(cursorSecret),maximumScannedRows=10000
 const revision=async()=>Number((await db.prepare("SELECT COALESCE(MAX(rowid),0) n FROM command_admissions WHERE state='committed'").first<{n:number}>())!.n)
 return async(ctx:RequestContext,scope:PolicyScope,input:RestQueryInput):Promise<Page<RecordRow>>=>{
  const {formula,...query}=input
  if(formula===undefined)return services.reader.query(ctx,scope,query)
  const descriptor=services.descriptors.get(scope.appId,scope.entityId)
  let expression:Expr
  try{expression=parseFormula(formula,descriptor.schema.fields.filter(field=>scope.readableFieldIds.includes(field.id)))}
  catch(error){if(error instanceof FormulaSyntaxError)throw new AdmissionError('validation',error.message);throw error}
  const dependencies=new Set<string>()
  const visit=(expr:Expr)=>{if(expr.kind==='field')dependencies.add(expr.fieldId);else if(expr.kind==='call')expr.args.forEach(visit)}
  visit(expression)
  const fields=[...new Set([...(query.fields??scope.readableFieldIds),...dependencies])]
  const binding=await cursor.binding({principal:ctx.principal.id,session:ctx.principal.sessionId??null,credential:ctx.principal.credentialId??null,baseSession:ctx.principal.baseSessionId??null,epoch:ctx.principal.authenticationEpoch,app:scope.appId,entity:scope.entityId,policy:scope.policyVersion,fields:scope.readableFieldIds,revision:descriptor.schema.physicalRevision,query:{...input,cursor:null,consistencyToken:null},predicate:(scope.cursorPredicate??scope.rowPredicate).sql,values:(scope.cursorPredicate??scope.rowPredicate).values})
  let retained:Awaited<ReturnType<typeof cursor.decode>>|undefined
  if(query.cursor){try{retained=await cursor.decode(query.cursor)}catch{throw new AdmissionError('stale_cursor','Invalid formula cursor. Refresh this query.')};if(retained.binding!==binding)throw new AdmissionError('stale_cursor','The formula query or access changed. Refresh this query.')}
  const limit=query.limit??100,offset=retained?.offset??0
  for(let attempt=0;attempt<3;attempt++){
   const rev=await revision()
   if(retained&&retained.revision!==rev)throw new AdmissionError('stale_cursor','Records changed. Refresh this formula query.')
   const candidates:RecordRow[]=[]
   let nativeCursor:string|undefined,total=0,scanned=0,changed=false
   do{
    const page=await services.reader.query(ctx,scope,{...query,cursor:nativeCursor,fields,limit:200})
    if(page.total.value>maximumScannedRows||page.total.kind==='at_least'&&page.total.value>=maximumScannedRows)throw new AdmissionError('validation','Formula predicates support at most 10000 candidate records. Add a condition filter to narrow the query.')
    for(const row of page.items){
     if(++scanned>maximumScannedRows)throw new AdmissionError('validation','Formula predicates support at most 10000 candidate records. Add a condition filter to narrow the query.')
     const cell=await evaluateExpression(expression,{async field(id){
      const value=row.fields[id]??{state:'redacted' as const,reason:'policy' as const},field=descriptor.fields.get(id)?.field
      if(value.state==='value'&&value.value!==null&&(field?.type==='select'||field?.type==='computed'&&field.resultType==='select')){
       const option=field.options?.find(option=>option.id===value.value)
       return option?{state:'value',value:option.label}:{state:'unavailable',code:'invalid_source',fieldIds:[id],message:'Source select option is unavailable'}
      }
      return value
     },async rollup(){throw new Error('Direct rollup predicates are unavailable')}})
     if(cell.state!=='value')throw new AdmissionError('validation','The formula predicate could not be evaluated from currently readable values.')
     if(!truthy(cell.value))continue
     if(total>=offset&&candidates.length<=limit)candidates.push(row)
     total++
    }
    if(await revision()!==rev){changed=true;break}
    await assertCurrentScopeAuthority(db,ctx,scope)
    nativeCursor=page.nextCursor??undefined
   }while(nativeCursor)
   if(changed)continue
   const items=candidates.slice(0,limit).map(row=>({...row,fields:Object.fromEntries(Object.entries(row.fields).filter(([id])=>!query.fields||query.fields.includes(id)))}))
   await assertCurrentScopeAuthority(db,ctx,scope)
   return {items,nextCursor:candidates.length>limit?await cursor.encode({binding,revision:rev,offset:offset+items.length}):null,total:{kind:total>10000?'at_least':'exact',value:Math.min(total,10000)},evaluatedAt:ctx.now}
  }
  throw new AdmissionError('stale_cursor','Records changed during the formula query. Refresh.')
 }
}
