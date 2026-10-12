const id=n=>String(n).padStart(26,'0')
/** Hand-authored native ground truth: target precedes a MANY writer; two
 * incoming definitions refer to the same exact ordered canonical cell. */
export function projectionFixture(width=2){
 const fields=Array.from({length:width},(_,n)=>({id:id(100+n),label:n===0?'Name':'Text '+n,type:'text',required:false,unique:false})),writerFields=[{id:id(300),label:'Source',type:'text',required:false,unique:false},{id:id(301),label:'Targets',type:'relation',required:false,unique:false,relation:{tableId:id(2),cardinality:'many',onDelete:'restrict'}}]
 return {format:'cradle-base',version:1,envelope:{capturedAt:'2026-10-08T00:00:00.000Z'},base:{id:id(1),name:'Projection business',tables:[{id:id(2),label:'Targets',primaryFieldId:id(100),fields,incomingRelations:[{id:id(400),label:'Backlinks',sourceEntityId:id(3),sourceFieldId:id(301)},{id:id(401),label:'Backlinks again',sourceEntityId:id(3),sourceFieldId:id(301)}],records:[{id:id(500),values:Object.fromEntries(fields.map((field,n)=>[field.id,n===0?'First':'literal']))},{id:id(501),values:Object.fromEntries(fields.map((field,n)=>[field.id,n===0?'Second':'literal']))}]},{id:id(3),label:'Sources',primaryFieldId:id(300),fields:writerFields,incomingRelations:[],records:[{id:id(502),values:{[id(300)]:'Source row',[id(301)]:[id(501),id(500)]}}]}],views:[],forms:[]}}
}
