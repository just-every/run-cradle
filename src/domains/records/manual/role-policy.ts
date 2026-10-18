import type { EntitySchema } from '../contracts'
import type { BaseRole } from './base-role'
import { ownerRules } from './authority.server'
export function roleRules(principalId:string,role:BaseRole,schemas:EntitySchema[]){
 const records=['record.create','record.patch','record.delete','record.bulk-preview','record.bulk-commit','record.undo','import.preview','import.commit','form.submit']
 const views=['view.save','view.delete','view.restore','view.preview']
 const comments=['comment.add','comment.edit','comment.delete']
 const actions=new Set([...views,...(role!=='read-only'?comments:[]),...(['owner','creator','editor'].includes(role)?records:[]),...(['owner','creator'].includes(role)?['release.adopt','form.save']:[])])
 return ownerRules(principalId,schemas).map(rule=>({...rule,actions:rule.actions.filter(action=>actions.has(action)),writableFields:['owner','creator','editor'].includes(role)?rule.writableFields:[]}))
}
