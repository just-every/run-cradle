import { restoreCsvMetadata } from './csv-schema-metadata'
import { accountCorrespondenceNulls } from './correspondence-accounting'
import { ImportInputError } from './input-error'
import { sourceWithOwnRowMaps, copyImportIdentities } from './source-maps'
import { completeColumnAccounting } from './accounting'
import { validateImportMapping } from './mapping-validation'
import { canonicalHash } from './canonical-stream'
import { validateCsvCapacity } from './csv-capacity'
import { reviewCorrespondence } from './correspondence'
import type { PreparedSource,ImportOptions,ImportIdentities,ImportReport,PlannedRecord,PlannedLink,SourceTable,SourceColumn } from './contracts'
import type { Field } from '../contracts'
import { canonical,nonempty,rawText,rawCellText,limit,cellCharacters,stableOptionId } from './format'
import { chosenType,inferColumn,inferCsvStructure } from './infer'
import { convertCell } from './convert'
import { columnChoices,selectOptionLabels } from './convert-choices'
import { resolveLinks,canonicalRow,canonicalizeReciprocal } from './links'
import { recognizeLookups } from './lookup'
import { recognizeWorkbookFormulas } from './workbook-formulas'
import { acknowledgmentFlags,type DetailedPreview,type ColumnPreview } from './report'
import { SOURCE_LIMITS } from './parse'
import { validateImportIdentities } from './identity-validation'
function projectionLabel(label:string):string {if(!label||label.length>200)throw new ImportInputError('Incoming projection label must contain 1–200 characters');return label}
function safeLabel(label:string,used:Set<string>,fallback:string):string {
 let base=label.trim()||fallback;if(base==='_record_id')base='Source _record_id'
 base=Array.from(base).reduce((out,char)=>out.length+char.length<=200?out+char:out,'');let out=base,n=2;while(used.has(out))out=base.slice(0,190)+` (${n++})`;used.add(out);return out
}
/** Complete recomputation against exact retained source; no database, network, mutation of source or prior preview. */
export function previewBaseImport(input:PreparedSource,options:ImportOptions,identities:ImportIdentities):DetailedPreview {
 const source=sourceWithOwnRowMaps(input)
 validateImportIdentities(source,identities)
 validateImportMapping(source,options)
 const correspondenceReview=reviewCorrespondence(source,options,identities),nullCells=new Set(correspondenceReview?.accepted?correspondenceReview.cells.filter(c=>c.state==='null').map(c=>JSON.stringify([c.tableKey,c.rowKey,c.columnKey])):[])
 validateCsvCapacity(source,options,correspondenceReview)
 if(!options.name.trim()||options.name.trim().length>120)throw new ImportInputError('Base name must contain 1–120 characters')
 limit('tables',20,source.tables.length,'Source',1)
 const inferred=inferCsvStructure(source,options),workingSource=inferred.source
 const report:ImportReport={version:1,tables:[],diagnostics:[],lookups:[],schemaRetainedAfterUndo:true},records:PlannedRecord[]=[],links:PlannedLink[]=[],fields=new Map<string,Field[]>(),columnPreviews:Record<string,ColumnPreview[]>=Object.create(null),rejected=new Set<string>(),relationColumns:{table:SourceTable;column:SourceColumn}[]=[]
 // Copy identities so adding legitimate owner options never changes the caller's previous preview.
 const ids=copyImportIdentities(identities)
 for(const table of workingSource.tables){
  for(const row of table.rows)for(const key of Object.keys(row.values))if(!table.columns.some(c=>c.key===key))report.diagnostics.push({code:'UNSUPPORTED_SOURCE_FIELD',tableKey:table.key,rowKey:row.key,columnKey:key,location:row.location,raw:row.values[key],message:'Unknown source field retained in raw source; no native field or activation created.'})
  const identity=ids.tables[table.key];if(!identity)throw new ImportInputError(`Missing identity map for ${table.key}`)
  if(source.format!=='csv-set')limit('fields',80,table.columns.length,table.key,1);limit('csvImportRows',10000,table.rows.length,table.key,1)
  const tableOptions=options.tables?.[table.key]??{},primary=tableOptions.primaryColumnKey??table.primaryColumnKey??table.columns[0]?.key
  if(!primary||!table.columns.some(c=>c.key===primary))throw new ImportInputError(`Unknown primary column in ${table.key}`)
  const label=tableOptions.label??table.label;if(!label.trim()||label.trim().length>120)throw new ImportInputError(`Table label in ${table.key} must contain 1–120 characters`)
  const accounting={tableKey:table.key,label,primaryColumnKey:primary,rowsRead:table.rows.length,created:0,rejected:0,columns:[] as ColumnPreview[],links:[] as ImportReport['tables'][number]['links']}
  report.tables.push(accounting);columnPreviews[table.key]=accounting.columns
  for(const row of table.rows)if(!identity.records[row.key])throw new ImportInputError(`Missing stable record identity for ${table.key}.${row.key}`)
  for(const column of table.columns)if(!identity.fields[column.key])throw new ImportInputError(`Missing stable field identity for ${table.key}.${column.key}`)
  const used=new Set<string>(),tableFields:Field[]=[];fields.set(table.key,tableFields)
  for(const column of table.columns){
   const override=tableOptions.columns?.[column.key]??{},type=chosenType(table,column,override),fieldLabel=override.derivedFrom&&type==='relation'?projectionLabel(override.label??column.label):safeLabel(override.label??column.label,used,`Column ${tableFields.length+1}`)
   const accountingColumn:ColumnPreview={columnKey:column.key,label:fieldLabel,chosenType:type,proposedType:inferColumn(table,column),...(column.sourceType?{sourceType:column.sourceType}:{}),...columnChoices(table,column,override),converted:0,unparseable:0,skippedNonempty:0,nonempty:table.rows.filter(r=>nonempty(r.values[column.key])).length,samples:[]}
   if(column.options){const usedOptions=new Set(table.rows.flatMap(r=>Array.isArray(r.values[column.key])?(r.values[column.key] as unknown[]).map(v=>String(v)):[rawText(r.values[column.key])]));accountingColumn.sourceOptions=[...column.options];accountingColumn.unusedSourceOptions=column.options.filter(v=>!usedOptions.has(v))}
   accounting.columns.push(accountingColumn)
   if(fieldLabel!==(override.label??column.label))report.diagnostics.push({code:'FIELD_LABEL_MAPPING',tableKey:table.key,columnKey:column.key,message:`Source field ${JSON.stringify(column.label)} mapped to safe native label ${JSON.stringify(fieldLabel)}; raw source key retained.`})
   if(type==='skipped'){
    accountingColumn.skippedNonempty=accountingColumn.nonempty;if(column.relationTableKey||column.sourceType==='multipleRecordLinks'||override.type==='relation')relationColumns.push({table,column})
    accountingColumn.skipReason=override.skip?'Owner chose skip':`${column.sourceType}: attachments/button have no imported native representation`
    accountingColumn.reasons.push(accountingColumn.skipReason)
    if(column.key===primary)throw new ImportInputError(`${table.key}: first/selected primary column cannot be skipped`)
    report.diagnostics.push({code:'COLUMN_SKIPPED',tableKey:table.key,columnKey:column.key,message:`${accountingColumn.skipReason}; ${accountingColumn.nonempty} nonempty values preserved in source`});continue
   }
   if(!['email','rating','duration','phone','text','number','date','instant','money','boolean','select','multi_select','url','person','relation','attachment','computed'].includes(type))throw new ImportInputError(`${table.key}.${column.label}: type ${type} is not supported by the native builder; choose TEXT explicitly`)
   const nativeFlags=correspondenceReview?.accepted?source.csvCorrespondence?.tables.find(t=>t.filename===table.key)?.columns.find(c=>c.key===column.key):undefined
   const field:Field={id:identity.fields[column.key],label:fieldLabel,type:type==='computed'?'text':type,required:nativeFlags?.required??false,unique:nativeFlags?.unique??false,...((nativeFlags?.validation??column.validation)?{validation:nativeFlags?.validation??column.validation}:{}),...(type==='number'&&(column.sourceType==='percent'||nativeFlags?.numberFormat==='percent')?{numberFormat:'percent' as const}:{})}
   if(type==='select'||type==='multi_select'){
    const labels=selectOptionLabels(table,column,override)
    if(new Set(labels).size!==labels.length||labels.some(v=>!v||v.length>200))throw new ImportInputError(`${table.key}.${column.label}: select options must be distinct nonempty labels up to 200 characters`)
    const optionIds=identity.options[column.key]??=Object.create(null);field.options=labels.map(label=>{if(!Object.hasOwn(optionIds,label))Object.defineProperty(optionIds,label,{value:stableOptionId(ids.appId,table.key,column.key,label),enumerable:true});return {label,id:optionIds[label]}});accountingColumn.options=labels
   }
   if(type==='relation'){relationColumns.push({table,column});const relationTarget=override.relationTableKey??column.relationTableKey;if(relationTarget!==undefined)accountingColumn.relationTarget=relationTarget}
   tableFields.push(field)
   if(column.sourceType&&['formula','rollup','multipleLookupValues','dateTime','multipleSelects','multipleCollaborators','singleCollaborator','createdBy','lastModifiedBy'].includes(column.sourceType))report.diagnostics.push({code:'SOURCE_TYPE_MAPPING',tableKey:table.key,columnKey:column.key,message:`${column.sourceType} exported content retained as ${type==='computed'?'text pending lookup proof':type}; source formula/rollup logic and accounts are never recreated. Native instant and multiple-select behavior apply only when explicitly chosen.`})
  }
  if(!tableFields.length)throw new ImportInputError(`${table.key}: choose at least one native field`)
  for(const row of table.rows){
   const values:PlannedRecord['fields']={};let bad=false
   for(const column of table.columns){
    const accountingColumn=accounting.columns.find(c=>c.columnKey===column.key)!,field=tableFields.find(f=>f.id===identity.fields[column.key]);if(!field)continue
    const raw=row.values[column.key]??'',origin=row.numericOrigins&&Object.hasOwn(row.numericOrigins,column.key)?row.numericOrigins[column.key]:undefined,location=origin?{...row.location,pointer:origin.pointer}:row.location,override=tableOptions.columns?.[column.key]??{}
    limit('cellCharacters',SOURCE_LIMITS.cellCharacters,cellCharacters(rawCellText(raw,row.numericTokens?.[column.key])),row.location.artifact,row.location.row??1)
    if(field.type==='relation')continue
    try{
     const converted=nullCells.has(JSON.stringify([table.key,row.key,column.key]))?{value:null,changed:true}:convertCell(field,column,raw,override,origin,row.numericTokens?.[column.key]);values[field.id]=converted.value;if(converted.changed){accountingColumn.converted++;report.diagnostics.push({code:'CELL_CONVERTED',tableKey:table.key,rowKey:row.key,columnKey:column.key,location,raw,converted:converted.value,message:`${column.label}: ${origin?'API JSON number to native '+field.type+' string; ':''}${field.type} conversion changed exported representation ${canonical(raw)} to ${canonical(converted.value)}`})}
     if(accountingColumn.samples.length<5)accountingColumn.samples.push({rowKey:row.key,raw,converted:converted.value})
    }catch(error){
     const message=error instanceof Error?error.message:'Invalid value';bad=true;accountingColumn.unparseable++
     report.diagnostics.push({code:'CELL_CONVERSION',tableKey:table.key,rowKey:row.key,columnKey:column.key,location,raw,message:`${row.location.artifact} LINE ${row.location.row??row.location.page??1}${origin?' '+origin.pointer+' raw '+origin.lexeme:''}: ${column.label}: ${message}`})
     if(accountingColumn.samples.length<5)accountingColumn.samples.push({rowKey:row.key,raw,error:message})
    }
   }
   if(bad)rejected.add(canonicalRow(table.key,row.key))
   else records.push({tableKey:table.key,rowKey:row.key,entityId:identity.entityId,recordId:identity.records[row.key],fields:values,location:row.location})
  }
 }
 report.diagnostics.push(...inferred.diagnostics)
 // Link parse/cardinality errors reject their own row before materializability is recomputed.
 let relations=resolveLinks(workingSource,options,ids,rejected,relationColumns,correspondenceReview)
 for(const relation of relations)for(const cell of relation.cells)if(cell.error){report.diagnostics.push(cell.error);const accounting=report.tables.find(t=>t.tableKey===cell.tableKey)!.columns.find(c=>c.columnKey===cell.columnKey)!;accounting.unparseable++;rejected.add(canonicalRow(cell.tableKey,cell.rowKey))}
 relations=resolveLinks(workingSource,options,ids,rejected,relationColumns,correspondenceReview)
 report.diagnostics.push(...canonicalizeReciprocal(relations.filter(r=>chosenType(r.table,r.column,options.tables?.[r.table.key]?.columns?.[r.column.key])!=='skipped')))
 const inverseViews:DetailedPreview['inverseViews']=[]
 for(const relation of relations){
  const tableRows=new Map(relation.table.rows.map(r=>[r.key,r])),targetTable=workingSource.tables.find(t=>t.key===relation.targetTableKey),targetRowsByNativeId=new Map(targetTable?.rows.map(r=>[ids.tables[targetTable.key].records[r.key],r])??[])
  const {table,column,targetTableKey,cardinality}=relation,field=fields.get(table.key)!.find(f=>f.id===ids.tables[table.key].fields[column.key]),tableAccounting=report.tables.find(t=>t.tableKey===table.key)!
  const listing={columnKey:column.key,referencesRead:0,resolved:0,unresolved:0,ambiguous:0,selected:0,materialized:0,listings:[] as ImportReport['diagnostics']};tableAccounting.links.push(listing)
  if(!field){report.diagnostics.push({code:'LINK_SKIPPED',tableKey:table.key,columnKey:column.key,message:'Link references classified and preserved although owner skipped native field.'})}
  else if(!targetTableKey||!ids.tables[targetTableKey]){
   // An unknown target cannot form a schema relation; keep source display TEXT pending owner mapping.
   field.type='text';report.diagnostics.push({code:'LINK_TARGET_REQUIRED',tableKey:table.key,columnKey:column.key,message:'Choose an imported target table to create native links; raw values currently retained as TEXT.'})
   for(const record of records.filter(r=>r.tableKey===table.key))record.fields[field.id]=rawText(tableRows.get(record.rowKey)!.values[column.key])
  }else if(relation.inverseOf){
   fields.set(table.key,fields.get(table.key)!.filter(f=>f.id!==field.id));inverseViews.push({tableKey:table.key,columnKey:column.key,canonicalTableKey:relation.inverseOf.tableKey,canonicalColumnKey:relation.inverseOf.columnKey,description:relation.inverseDescription!+` Owner preview labels: ${report.tables.find(t=>t.tableKey===relation.inverseOf!.tableKey)!.label}.${report.tables.find(t=>t.tableKey===relation.inverseOf!.tableKey)!.columns.find(c=>c.columnKey===relation.inverseOf!.columnKey)!.label}.`})
   for(const record of records.filter(r=>r.tableKey===table.key))delete record.fields[field.id]
  }else field.relation={ownerAppId:ids.appId,entityId:ids.tables[targetTableKey].entityId,cardinality,onDelete:'restrict'}
  for(const cell of relation.cells){
   const row=tableRows.get(cell.rowKey)!,targetRecordIds:string[]=[]
   for(const ref of cell.references){
    listing.referencesRead++;listing[ref.state]++
    const details={code:`LINK_${ref.state.toUpperCase()}`,tableKey:table.key,rowKey:row.key,columnKey:column.key,location:row.location,raw:ref.raw,message:ref.state==='unresolved'?`${JSON.stringify(ref.reference)} not found in ${targetTable?.label??'the linked table'}.`:ref.state==='ambiguous'?`${JSON.stringify(ref.reference)} matches several records in ${targetTable?.label??'the linked table'}; choose a specific record.`:`${JSON.stringify(ref.reference)} matched in ${targetTable?.label??'the linked table'}.`,reference:ref.reference,sourcePrimary:row.values[tableAccounting.primaryColumnKey]??'',sourcePrimaryColumnKey:tableAccounting.primaryColumnKey,...(targetTableKey?{targetTableKey}:{}),...(targetTable?{targetPrimaryColumnKey:options.tables?.[targetTable.key]?.primaryColumnKey??targetTable.primaryColumnKey??targetTable.columns[0].key}:{}),candidates:ref.candidates.map(recordId=>{const target=workingSource.tables.find(t=>t.key===targetTableKey)!,targetPrimary=options.tables?.[target.key]?.primaryColumnKey??target.primaryColumnKey??target.columns[0].key,targetRow=targetRowsByNativeId.get(recordId)!;return {tableKey:target.key,primaryFieldId:ids.tables[target.key].fields[targetPrimary],raw:targetRow.values[targetPrimary]??'',recordId}}),materializable:ref.materializable,...(ref.selection?{selection:ref.selection}:{})};listing.listings.push(details)
    if(ref.state==='resolved'&&!ref.materializable){report.diagnostics.push({...details,code:'TARGET_ROW_REJECTED',message:'Raw identity resolved but no native link is materializable because its source or target row was rejected.'})}
    if(ref.selection)listing.selected++;if(ref.materializable){if(field?.type==='relation'&&!relation.inverseOf)listing.materialized++;targetRecordIds.push(ref.effectiveRecordId!)}
   }
   const columnAccounting=tableAccounting.columns.find(c=>c.columnKey===column.key)!,raw=row.values[column.key]??''
   if(field?.type==='relation'||relation.inverseOf){
    const refs=targetRecordIds.map(recordId=>({appId:ids.appId,entityId:ids.tables[targetTableKey!].entityId,recordId})),converted=cardinality==='one'?refs[0]??null:refs
    if(canonical(raw)!==canonical(converted)){columnAccounting.converted++;report.diagnostics.push({code:'LINK_CONVERTED',tableKey:table.key,rowKey:row.key,columnKey:column.key,location:row.location,raw,message:[...cell.references.filter(ref=>ref.state!=='resolved'&&!ref.selection).map(ref=>ref.state==='unresolved'?`${JSON.stringify(ref.reference)} not found in ${targetTable?.label??'the linked table'}.`:`${JSON.stringify(ref.reference)} matches several records in ${targetTable?.label??'the linked table'}.`),`${targetRecordIds.length} linked ${targetRecordIds.length===1?'record':'records'} ready to import.`].join(' ')})}
    const columnPreview=columnAccounting as ColumnPreview;if(columnPreview.samples.length<5)columnPreview.samples.push({rowKey:row.key,raw,converted})
   }
   if(field&&!relation.inverseOf&&field.type==='relation'&&!rejected.has(canonicalRow(table.key,row.key)))links.push({tableKey:table.key,rowKey:row.key,entityId:ids.tables[table.key].entityId,recordId:ids.tables[table.key].records[row.key],fieldId:field.id,targetEntityId:ids.tables[targetTableKey!].entityId,targetRecordIds:[...new Set(targetRecordIds)],cardinality,location:row.location})
  }
 }
 const accepted=records.filter(r=>!rejected.has(canonicalRow(r.tableKey,r.rowKey)))
 const workbookFormulas=recognizeWorkbookFormulas(workingSource,options,ids,fields,accepted)
 if(workbookFormulas.length)report.workbookFormulas=workbookFormulas
 for(const formula of workbookFormulas){
  const column=report.tables.find(t=>t.tableKey===formula.tableKey)!.columns.find(c=>c.columnKey===formula.columnKey)!
  if(formula.matchesAllRows){column.proposedType='computed';if(!column.validTypes.includes('computed'))column.validTypes.push('computed')}
  column.reasons.push(formula.recognized?`Workbook formula proposed: ${formula.nativeFormula}; ${formula.matchedRows} of ${formula.rowsRead} cached results match. Recomputes after input edits.`:`Workbook formula not preserved: ${formula.reason}. Cached values retained in the chosen field type, or only in source if skipped.`)
  report.diagnostics.push({code:formula.recognized?'WORKBOOK_FORMULA_PROPOSED':'WORKBOOK_FORMULA_REFUSED',tableKey:formula.tableKey,columnKey:formula.columnKey,message:column.reasons[column.reasons.length-1]})
 }
 const lookupResults=recognizeLookups(workingSource,options,ids,fields,accepted,relations)
 report.lookups=lookupResults
 for(const lookup of lookupResults){const column=report.tables.find(t=>t.tableKey===lookup.tableKey)!.columns.find(c=>c.columnKey===lookup.columnKey)!;(column as ColumnPreview).lookupCandidates=lookup.candidates;if(lookup.candidates.some(candidate=>candidate.matchesAllRows)){if(!column.validTypes.includes('computed'))column.validTypes.push('computed')}else column.validTypes=column.validTypes.filter(type=>type!=='computed');if(lookup.ambiguity){report.diagnostics.push(lookup.ambiguity);column.reasons.push(lookup.ambiguity.message)}if(lookup.firstMismatch){report.diagnostics.push(lookup.firstMismatch);column.reasons.push(lookup.firstMismatch.message)}else if(lookup.recognized)column.reasons.push('Lookup recognized: every exported row exactly equals recomputation through its actual ONE link; exported display is not written as a computed value.')}
 for(const accounting of report.tables){accounting.created=accepted.filter(r=>r.tableKey===accounting.tableKey).length;accounting.rejected=accounting.rowsRead-accounting.created;for(const c of accounting.columns){const field=fields.get(accounting.tableKey)?.find(f=>f.id===ids.tables[accounting.tableKey].fields[c.columnKey]);if(field)c.chosenType=field.type}}
 report.reciprocalRelations=inverseViews.map(view=>({...view,inverseId:ids.tables[view.tableKey].fields[view.columnKey],label:report.tables.find(t=>t.tableKey===view.tableKey)!.columns.find(c=>c.columnKey===view.columnKey)!.label}))
 const schemaDraft={appId:ids.appId,name:options.name,tables:report.tables.map(t=>({id:ids.tables[t.tableKey].entityId,label:t.label,primaryFieldId:ids.tables[t.tableKey].fields[t.primaryColumnKey],fields:fields.get(t.tableKey)!,incomingRelations:inverseViews.filter(v=>v.tableKey===t.tableKey).map(v=>({id:ids.tables[v.tableKey].fields[v.columnKey],label:report.tables.find(t=>t.tableKey===v.tableKey)!.columns.find(c=>c.columnKey===v.columnKey)!.label,sourceEntityId:ids.tables[v.canonicalTableKey].entityId,sourceFieldId:ids.tables[v.canonicalTableKey].fields[v.canonicalColumnKey]}))}))}
 restoreCsvMetadata(source,ids,schemaDraft,correspondenceReview?.accepted===true)
 for(const table of schemaDraft.tables){limit('fields',80,table.fields.length,table.label,1);limit('incomingRelations',80,table.incomingRelations.length,table.label,1)}
 for(const table of report.tables)for(const column of table.columns)if(column.converted)column.reasons.push(`${column.converted} cell representations changed; see complete conversion diagnostics.`)
 validateImportIdentities(source,ids)
 completeColumnAccounting(workingSource,options,ids,fields,accepted,report)
 accountCorrespondenceNulls(report,accepted,correspondenceReview)
 const unresolved=accepted.reduce((n,row)=>n+Object.values(row.fields).reduce<number>((sum,value)=>sum+(Array.isArray(value)?value.filter(member=>member&&typeof member==='object'&&'reference' in member).length:0),0),0);if(unresolved)report.storeReferences={unresolved,resolved:0,unverified:0}
 const acknowledgments=acknowledgmentFlags(report),content={...(correspondenceReview?{correspondenceReview}:{}),source,identities:ids,options,schemaDraft,records:accepted,links,report,acknowledgments,columnPreviews,inverseViews}
 return {...content,fingerprint:canonicalHash(content),acknowledgmentRequired:Object.values(acknowledgments).some(Boolean)}
}
