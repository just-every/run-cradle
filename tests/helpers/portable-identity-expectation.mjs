import assert from 'node:assert/strict'

/** Independent v1 oracle: map only identity coordinates, never business strings. */
export function portableIdentityExpectation(snapshot,ids){
 const map=new Map(),put=(source,target)=>{assert.match(target??'',/^[0-9A-HJKMNP-TV-Z]{26}$/);if(map.has(source))assert.equal(map.get(source),target);else map.set(source,target)}
 put(snapshot.base.id,ids.appId)
 for(const table of snapshot.base.tables){const identity=ids.tables[table.id];assert.ok(identity);put(table.id,identity.entityId)
  for(const field of table.fields){put(field.id,identity.fields[field.id]);if(field.type==='select')for(const option of field.options)put(option.id,identity.options[field.id][option.label])}
  for(const record of table.records)put(record.id,identity.records[record.id])
  for(const incoming of table.incomingRelations)put(incoming.id,ids.incomingRelations[incoming.id])
 }
 for(const view of snapshot.base.views)put(view.id,ids.views[view.id])
 for(const form of snapshot.base.forms)put(form.id,ids.forms[form.id])
 assert.equal(new Set(map.values()).size,map.size,'Every source identity has one distinct destination identity')
 const mapped=id=>{assert.ok(map.has(id),'Every identity coordinate is covered: '+id);return map.get(id)}
 const value=(field,cell)=>{
  if(cell===null)return null
  if(field.type==='relation'||field.type==='select'||field.resultType==='select')return Array.isArray(cell)?cell.map(mapped):mapped(cell)
  return cell
 }
 const result=structuredClone(snapshot)
 result.base.id=mapped(snapshot.base.id)
 for(const [index,table]of snapshot.base.tables.entries()){
  const output=result.base.tables[index];output.id=mapped(table.id);output.primaryFieldId=mapped(table.primaryFieldId)
  for(const field of output.fields){field.id=mapped(field.id);if(field.options)field.options=field.options.map(option=>({...option,id:mapped(option.id)}));if(field.relation)field.relation.tableId=mapped(field.relation.tableId);if(field.lookup){field.lookup.relationFieldId=mapped(field.lookup.relationFieldId);field.lookup.valueFieldId=mapped(field.lookup.valueFieldId)}}
  output.incomingRelations=table.incomingRelations.map(incoming=>({...incoming,id:mapped(incoming.id),sourceEntityId:mapped(incoming.sourceEntityId),sourceFieldId:mapped(incoming.sourceFieldId)}))
  output.records=table.records.map(record=>{const cells={...record.values}
   // Handwritten input may omit read-only lookup values. Their definitions,
   // target records and cells independently determine the exported value.
   for(const field of table.fields)if(field.type==='computed'&&!Object.hasOwn(cells,field.id)){const relation=table.fields.find(candidate=>candidate.id===field.lookup.relationFieldId),target=snapshot.base.tables.find(candidate=>candidate.id===relation.relation.tableId),reference=cells[relation.id];assert.equal(relation.relation.cardinality,'one');cells[field.id]=reference===null?null:target.records.find(row=>row.id===reference)?.values[field.lookup.valueFieldId]??null}
   return {id:mapped(record.id),values:Object.fromEntries(Object.entries(cells).map(([fieldId,cell])=>{const field=table.fields.find(field=>field.id===fieldId);assert.ok(field);return [mapped(fieldId),value(field,cell)]}))}
  }).sort((a,b)=>a.id.localeCompare(b.id))
 }
 const filter=(input,table)=>{
  if(input.kind!=='condition')return {...input,conditions:input.conditions.map(condition=>filter(condition,table))}
  const output={...input,fieldId:mapped(input.fieldId)},field=table.fields.find(field=>field.id===input.fieldId);assert.ok(field)
  if(input.value!==undefined&&input.value!==null){if(field.type==='select'||field.resultType==='select')output.value=Array.isArray(input.value)?input.value.map(mapped):mapped(input.value)
   else if(field.type==='relation'){const reference=cell=>({...cell,appId:mapped(cell.appId),entityId:mapped(cell.entityId),recordId:mapped(cell.recordId)});output.value=Array.isArray(input.value)?input.value.map(reference):reference(input.value)}}
  return output
 }
 result.base.views=snapshot.base.views.map(view=>{const table=snapshot.base.tables.find(table=>table.id===view.tableId);assert.ok(table);return {...view,id:mapped(view.id),tableId:mapped(view.tableId),fields:view.fields.map(mapped),filter:filter(view.filter,table),sort:view.sort.map(sort=>({...sort,fieldId:mapped(sort.fieldId)})),groupBy:view.groupBy.map(mapped),layout:Object.fromEntries(Object.entries(view.layout).map(([key,id])=>[key,mapped(id)]))}}).sort((a,b)=>a.id.localeCompare(b.id))
 result.base.forms=snapshot.base.forms.map(form=>({...form,id:mapped(form.id),tableId:mapped(form.tableId),fields:form.fields.map(field=>({...field,fieldId:mapped(field.fieldId)}))})).sort((a,b)=>a.id.localeCompare(b.id))
 return {snapshot:result,map}
}
