import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
import {newField} from '../../src/ui/records/schema/templates.ts'

export const rulesCommand=(input,expected=[])=>({commandId:createUlid(),expected,input})

/** Independent stored values make the two overlapping violation sets explicit. */
export async function storedRulesFixture(h,{violations=false,label='native'}={}){
 const order={...newField('Order'),required:true,unique:true},status=newField('Status','select'),ship=newField('Ship date','date'),discount=newField('Discount','number'),approval=newField('Manager approval','boolean'),memo=newField('Memo')
 status.options=['Draft','Shipped'].map(label=>({id:createUlid(),label}));status.defaultValue=status.options[0].id
 discount.defaultValue='0';approval.defaultValue=false
 const appId=createUlid(),entityId=createUlid(),fields=[order,status,ship,discount,approval,memo]
 const condition=(field,op,value)=>({kind:'condition',fieldId:field.id,op,...(value===undefined?{}:{value})})
 const rules=[{id:createUlid(),name:'Ship date',message:'Shipped orders need a ship date.',when:condition(status,'eq',status.options[1].id),require:condition(ship,'not_empty')},{id:createUlid(),name:'Manager approval',message:'Discounts above 20 need manager approval.',when:condition(discount,'gt','20'),require:condition(approval,'eq',true)}]
 const draft={appId,name:`synthetic-cradle-rules ${label}`,tables:[{id:entityId,label:'Orders',primaryFieldId:order.id,fields,validationRules:violations?[]:rules}]}
 const call=async(route,body,status=200,method=body===undefined?'GET':'POST')=>(await h.request(route,{method,body,status})).data
 const base=`/api/v1/apps/${appId}/entities/${entityId}`
 const schema=()=>call(base),read=id=>call(base+'/records/'+id).then(value=>value.record)
 const rows=()=>call(base+'/query',{limit:100}).then(value=>value.items.sort((a,b)=>a.id.localeCompare(b.id)))
 const snapshot=async()=>({schema:await call('/api/v1/records/bases/'+appId),rows:await rows()})
 const preview=await call('/api/v1/records/schema-preview',draft)
 await call('/api/v1/commands/release.adopt',rulesCommand({kind:'manual_schema',previewId:preview.id}))
 const create=async values=>call('/api/v1/commands/record.create',rulesCommand({appId,entityId,values},[{ref:{appId,entityId:'00000000000000000000000001',recordId:entityId},version:(await schema()).version}])).then(value=>value.value)
 const patch=async(row,changes)=>call('/api/v1/commands/record.patch',rulesCommand({ref:row.ref,changes},[{ref:row.ref,version:row.version}])).then(value=>value.value)
 const seeds=[]
 if(violations){
  seeds.push(await create({[order.id]:'Shipping violator',[status.id]:status.options[1].id,[discount.id]:'0',[approval.id]:false}))
  seeds.push(await create({[order.id]:'Approval violator',[status.id]:status.options[0].id,[discount.id]:'21',[approval.id]:false}))
  seeds.push(await create({[order.id]:'Both rules violator',[status.id]:status.options[1].id,[discount.id]:'25',[approval.id]:false}))
 }
 const control=await create({[order.id]:'Valid control',[status.id]:status.options[1].id,[ship.id]:'2027-01-15',[discount.id]:'25',[approval.id]:true})
 const values=(name,{shipped=false,approved=false,high=false,date=null}={})=>({[order.id]:name,[status.id]:status.options[shipped?1:0].id,[ship.id]:date,[discount.id]:high?'25':'0',[approval.id]:approved})
 return {appId,entityId,order,status,ship,discount,approval,memo,fields,rules,draft,base,call,schema,read,rows,snapshot,create,patch,seeds,control,values,path:`${h.origin}/app/records/${appId}/${entityId}`}
}

export function assertStoredRuleViolators(preview,f){
 const impact=preview.impacts.find(item=>item.entityId===f.entityId)
 assert.equal(impact.violatingRecordCount,3,'Count distinct records, including the overlapping violator only once')
 assert.deepEqual([...impact.violatingRecordIds].sort(),f.seeds.map(row=>row.id).sort())
 for(const [index,expected]of [[0,[f.seeds[0].id,f.seeds[2].id]],[1,[f.seeds[1].id,f.seeds[2].id]]]){
  const violation=impact.validationViolations.find(item=>item.ruleName===f.rules[index].name)
  assert.equal(violation.count,2);assert.equal(violation.message,f.rules[index].message)
  assert.deepEqual([...violation.recordIds].sort(),expected.sort())
 }
 assert.ok(!impact.violatingRecordIds.includes(f.control.id),'The independently valid control is not a violator')
}
