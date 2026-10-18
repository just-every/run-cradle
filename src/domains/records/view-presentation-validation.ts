import type {Field,Filter,View} from './contracts'
import {validateCell} from './validators'
export function validateViewPresentation(view:Pick<View,'fields'|'summaries'|'formatting'>,fields:Field[]){
 const get=(id:string)=>{const field=fields.find(f=>f.id===id);if(!field||!view.fields.includes(id))throw Error('Presentation fields must be visible and readable');return field}
 if(new Set(view.summaries?.map(item=>item.fieldId)).size!==(view.summaries?.length??0))throw Error('Choose one summary per column')
 for(const item of view.summaries??[]){const f=get(item.fieldId);if(['sum','average','min','max'].includes(item.aggregate)&&!['number','money'].includes(f.type==='computed'?f.resultType??'':f.type))throw Error('Numeric summaries require number or money fields')}
 function filter(rule:Filter,depth=0):void{
  if(depth>64)throw Error('Colour rule depth exceeds 64')
  if(rule.kind!=='condition'){rule.conditions.forEach(item=>filter(item,depth+1));return}
  const f=get(rule.fieldId),type=f.type==='computed'?f.resultType:f.type
  if(['empty','not_empty'].includes(rule.op))return
  if(rule.op==='contains'&&!['text','url','array','multi_select','relation'].includes(type??''))throw Error('Contains requires text or a collection')
  if(rule.op==='next_days'){if(type!=='date'||typeof rule.value!=='string'||!/^\d{1,4}$/.test(rule.value))throw Error('Next days requires a date and a number of days');return}
  if(type==='array')return
  const check=(value:unknown)=>validateCell({...f,type:type as Field['type'],required:false,validation:undefined},value)
  if(rule.op==='in'){if(!Array.isArray(rule.value))throw Error('One of requires a list');rule.value.forEach(check)}else check(rule.value??null)
 }
 for(const rule of view.formatting??[]){if(rule.target==='cell'){if(!rule.fieldId)throw Error('Cell formatting needs a target field');get(rule.fieldId)}filter(rule.filter)}
}
