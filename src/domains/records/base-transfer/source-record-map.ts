import { AdmissionError } from '../../admission/errors'
import type { ImportStatus, PreparedSource, PlannedRecord, ImportIdentities } from './contracts'

export function sourceRecordMapState(status:ImportStatus,source:PreparedSource) {
 if(source.format!=='api')return {available:false as const,reason:'Source record ID maps are available only for recorded API imports.'}
 if(status.job.state!=='completed')return {available:false as const,reason:'The import must be completed before a source record ID map is available.'}
 if(status.restoreHeld)return {available:false as const,reason:'This restored import requires current owner confirmation before a source record ID map is available.'}
 if(!status.reconciliation.ok)return {available:false as const,reason:'Native readback must match the retained import before a source record ID map is available.'}
 return {available:true as const}
}

/** Only reviewed, reconciled creates have a mapping; allocated IDs for rejected rows do not. */
export function buildSourceRecordMap(input:{status:ImportStatus;source:PreparedSource;records:PlannedRecord[];identities:ImportIdentities}) {
 const {status,source,records,identities}=input,state=sourceRecordMapState(status,source)
 if(!state.available)throw new AdmissionError('version_conflict',state.reason)
 const sourceRows=new Map(source.tables.map(table=>[table.key,new Set(table.rows.map(row=>row.key))]))
 const seen=new Set<string>(),targets=new Set<string>()
 const rows=records.map(record=>{
  const identity=identities.tables[record.tableKey]
  const key=JSON.stringify([record.tableKey,record.rowKey]),target=JSON.stringify([record.entityId,record.recordId])
  if(!sourceRows.get(record.tableKey)?.has(record.rowKey)||!identity||identity.entityId!==record.entityId||identity.records[record.rowKey]!==record.recordId||identities.appId!==status.job.destination||seen.has(key)||targets.has(target))throw new AdmissionError('version_conflict','The retained source record identities do not match the adopted import.')
  seen.add(key);targets.add(target)
  return {sourceTableId:record.tableKey,sourceRecordId:record.rowKey,appId:identities.appId,entityId:record.entityId,recordId:record.recordId}
 })
 return {format:'cradle-source-record-map' as const,version:1 as const,jobId:status.job.id,sourceKind:source.format,sourceNamespace:source.namespace,records:rows}
}
export type SourceRecordMap=ReturnType<typeof buildSourceRecordMap>
export function sourceRecordMapCsv(map:SourceRecordMap):string {
 const keys=['sourceTableId','sourceRecordId','appId','entityId','recordId'] as const
 const cell=(value:string)=>`"${value.replaceAll('"','""')}"`
 return [keys.join(','),...map.records.map(row=>keys.map(key=>cell(row[key])).join(','))].join('\r\n')+'\r\n'
}
