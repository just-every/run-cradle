import {auditOperation} from '../admission/operation-audit.server'
import {z} from 'zod'
import type {RequestContext} from '../authority/ports'
import type {createRecordServices} from './service.server'
import {idSchema,querySchema} from './validators'
import {AdmissionError} from '../admission/errors'
import {assertGuards} from './fence.server'
import {exportContext,formatWorkspaceCell} from './csv-export.server'
import {createCsvLabels,displayCsvLabels,displayCsvValue} from './csv-display.server'
import {encodeCsvRecord} from '../portability/csv'
import {typedExportCell,workbookMime} from './workbooks/export'
import {streamWorkbook} from './workbooks/stream'
import {byteStream} from './workbooks/stream-zip'
import {launchOverdueKind,overdueFieldIds,overdueMarkerField,projectLaunchOverdue} from '../../apps/launch/overdue-projection.server'
import {launchFieldIds} from '../../apps/launch/descriptors.server'

/** A download holds one policy-checked page; it never assembles a CSV/base64 workbook. */
export function createStreamExport(db:D1Database,services:ReturnType<typeof createRecordServices>){
 return async(ctx:RequestContext,input:unknown,format:'csv'|'xlsx')=>{
  const request=z.object({appId:idSchema,entityId:idSchema,viewId:idSchema.optional(),query:querySchema}).strict().parse(input)
  const {reader,policy,metadata,descriptors}=services,d=descriptors.get(request.appId,request.entityId),view=request.viewId?await metadata.readView(ctx,request.viewId):null
  if(view&&(view.appId!==request.appId||view.entityId!==request.entityId))throw new AdmissionError('validation','View belongs to another table.')
  const scope=await policy.scope(ctx,{appId:request.appId,entityId:request.entityId,purpose:'export'}),query=view?{fields:view.fields,sort:view.sort,filter:view.filter,groupBy:view.groupBy}:request.query
  const fields=(query.fields??d.schema.fields.map(f=>f.id)).map(id=>{const field=d.schema.fields.find(f=>f.id===id);if(!field||!scope.readableFieldIds.includes(id))throw new AdmissionError('forbidden','An export field is unavailable.');return field})
  const context=await exportContext(db,view?.name??d.schema.label,ctx.now,fields),revision=await reader.revision()
  await assertGuards(db,scope.currentAuthorityGuards)
  const kind=d.legacy?launchOverdueKind(request.appId,request.entityId):null,overdueInputs=kind&&overdueFieldIds(kind).every(id=>scope.readableFieldIds.includes(id))?overdueFieldIds(kind):[]
  const marker=kind?overdueMarkerField(kind,fields.map(field=>Object.keys(launchFieldIds[kind]).find(name=>launchFieldIds[kind][name]===field.id)??field.id)):undefined,markerId=kind&&marker?launchFieldIds[kind][marker]??marker:undefined
  async function* pages(){
   let cursor:string|undefined
   do{
    const pageCtx={...ctx,now:new Date().toISOString()},currentScope=await policy.scope(pageCtx,{appId:request.appId,entityId:request.entityId,purpose:'export'})
    if(currentScope.policyVersion!==scope.policyVersion||fields.some(field=>!currentScope.readableFieldIds.includes(field.id)))throw new AdmissionError('forbidden','Export authority changed. Start the download again.')
    const guards=[...currentScope.currentAuthorityGuards],labels=createCsvLabels(services,pageCtx,guards)
    await assertGuards(db,guards)
    if(await reader.revision()!==revision)throw new AdmissionError('version_conflict','Records changed during export. Start the download again.')
    const page=await reader.query(pageCtx,currentScope,{...query,fields:[...new Set([...fields.map(f=>f.id),...overdueInputs])],limit:50,cursor},'export')
    const overdue=kind&&overdueInputs.length?await projectLaunchOverdue(db,kind,page.items,ctx.now):null;if(overdue)guards.push(...overdue.guards)
    const rows=[]
    for(const row of page.items){const display=await Promise.all(fields.map(async field=>{
     const cell=row.fields[field.id];if(cell?.state!=='value')throw new AdmissionError('forbidden','Export contains a restricted or unavailable value.')
     if(field.type==='relation'||field.type==='computed'&&field.resultElementType==='relation')return labels.display(field,cell.value)
     if(d.legacy&&field.type==='multi_select'){if(!Array.isArray(cell.value)||cell.value.some(value=>typeof value!=='string'))throw new AdmissionError('validation','Legacy multi-select values must be text labels.');return displayCsvLabels(cell.value as string[])}
     if(d.schema.physicalRevision.startsWith('manual_'))return displayCsvValue(field,cell.value)
     const value=formatWorkspaceCell(field,cell.value,context,()=>field.type==='select'?String(cell.value??''):displayCsvValue(field,cell.value));return field.id===markerId&&overdue?.flags.get(row.id)?`${value} (Overdue)`:value
    }));rows.push({row,display})}
    await assertGuards(db,guards)
    if(await reader.revision()!==revision)throw new AdmissionError('version_conflict','Records changed during export. Start the download again.')
    yield rows;cursor=page.nextCursor??undefined
   }while(cursor)
  }
  const headers=fields.map(f=>f.label),encoder=new TextEncoder()
  async function* csv(){yield encoder.encode(encodeCsvRecord(headers));for await(const page of pages())for(const {display}of page)yield encoder.encode(encodeCsvRecord(display))}
  async function* workbookRows(){for await(const page of pages())for(const {row,display}of page)yield fields.map((field,i)=>(()=>{const cell=row.fields[field.id];if(cell?.state!=='value')throw new AdmissionError('forbidden','Export contains an unavailable value.');return typedExportCell(field,cell.value,display[i]!)})())}
  const filename=context.filename.replace(/\.csv$/i,format==='xlsx'?'.xlsx':'.csv'),iterator=format==='csv'?csv():streamWorkbook([{name:context.filename.replace(/\.csv$/i,''),headers,rows:workbookRows()}])
  await auditOperation(db,ctx,'view.export.'+format,request.appId)
  return new Response(byteStream(iterator),{headers:{'content-type':format==='xlsx'?workbookMime:'text/csv;charset=utf-8','content-disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(filename),'cache-control':'no-store','x-content-type-options':'nosniff'}})
 }
}
