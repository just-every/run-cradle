import type {D1TargetAdapter} from '../../../vendor/base/modules/import-kit/src/d1/types'
/** Operator identity is a native target even though ordinary base imports cannot
 * create operators. Related source records are severed, while their native rows
 * are redacted by the normal admission plan in this same transaction. */
export function operatorErasureTarget(native:D1TargetAdapter,memberId:string):D1TargetAdapter{
 return {...native,async read(db,destination,kind,id){
  if(kind!=='operator')return native.read(db,destination,kind,id)
  if(id!==memberId)throw new Error('Unexpected operator target')
  const row=await db.prepare("SELECT o.name,o.email,p.version,p.state FROM operators o JOIN authority_principals p ON p.id=o.id WHERE o.id=? AND p.state<>'erased'").bind(id).first<{name:string;email:string;version:number;state:string}>()
  return row?{destination,targetKind:kind,targetId:id,value:row,revision:String(row.version)}:undefined
 },matches(row,destination,kind,id){
  if(kind!=='operator')return native.matches(row,destination,kind,id)
  if(row){const value=row.value as {name:string;email:string;version:number;state:string};return {sql:'EXISTS(SELECT 1 FROM operators o JOIN authority_principals p ON p.id=o.id WHERE o.id=? AND o.name=? AND o.email=? AND p.version=? AND p.state=?)',params:[id,value.name,value.email,value.version,value.state]}}
  return {sql:"EXISTS(SELECT 1 FROM authority_principals WHERE id=? AND state='erased')",params:[id]}
 }}
}
