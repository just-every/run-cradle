export type S3Destination={kind:'s3';endpoint:string;region:string;bucket:string;prefix:string}
export type WarehouseDestination={kind:'r2'}|S3Destination|{kind:'bigquery';project:string;dataset:string;tablePrefix:string;location:string}|{kind:'snowflake';account:string;user:string;database:string;schema:string;tablePrefix:string;stage:string;stageStorage:S3Destination;warehouse?:string;role?:string}
export type WarehouseSecrets={accessKeyId:string;secretAccessKey:string;serviceAccountJson:string;privateKeyPem:string}
export const emptyWarehouseSecrets=():WarehouseSecrets=>({accessKeyId:'',secretAccessKey:'',serviceAccountJson:'',privateKeyPem:''})
const s3=():S3Destination=>({kind:'s3',endpoint:'',region:'us-east-1',bucket:'',prefix:''})
export function warehouseAccess(destination:WarehouseDestination,secrets:WarehouseSecrets){
 if(destination.kind==='r2')return undefined
 if(destination.kind==='bigquery'){
  if(!secrets.serviceAccountJson.trim())return undefined
  let value:unknown;try{value=JSON.parse(secrets.serviceAccountJson)}catch{throw new Error('Enter valid service-account JSON.')}
  if(!value||typeof value!=='object'||!('client_email'in value)||typeof value.client_email!=='string'||!('private_key'in value)||typeof value.private_key!=='string')throw new Error('Service-account JSON needs client_email and private_key.')
  return {clientEmail:value.client_email,privateKey:value.private_key}
 }
 if(destination.kind==='snowflake')return secrets.privateKeyPem||secrets.accessKeyId||secrets.secretAccessKey?{privateKeyPem:secrets.privateKeyPem,accessKeyId:secrets.accessKeyId,secretAccessKey:secrets.secretAccessKey}:undefined
 return secrets.accessKeyId||secrets.secretAccessKey?{accessKeyId:secrets.accessKeyId,secretAccessKey:secrets.secretAccessKey}:undefined
}
function S3Fields({value,onChange,stage=false}:{value:S3Destination;onChange:(value:S3Destination)=>void;stage?:boolean}){
 const label=stage?'Stage S3':'S3'
 return <fieldset className="cr-stack"><legend>{stage?'Owner’s S3-compatible stage':'S3 destination'}</legend>
  <label className="cr-field">{label} endpoint<input type="url" required value={value.endpoint} placeholder="https://s3.us-east-1.amazonaws.com" onChange={event=>onChange({...value,endpoint:event.target.value})}/></label>
  <label className="cr-field">{label} region<input required value={value.region} onChange={event=>onChange({...value,region:event.target.value})}/></label>
  <label className="cr-field">{label} bucket<input required value={value.bucket} onChange={event=>onChange({...value,bucket:event.target.value})}/></label>
  <label className="cr-field">{label} prefix<input value={value.prefix} onChange={event=>onChange({...value,prefix:event.target.value})}/></label>
 </fieldset>
}
export function WarehouseDestinationFields({destination,access,hasCredentials,onDestination,onAccess}:{destination:WarehouseDestination;access:WarehouseSecrets;hasCredentials:boolean;onDestination:(value:WarehouseDestination)=>void;onAccess:(value:WarehouseSecrets)=>void}){
 const d=destination
 return <>
 <label className="cr-field">Destination<select value={d.kind} onChange={event=>onDestination(event.target.value==='r2'?{kind:'r2'}:event.target.value==='s3'?s3():event.target.value==='bigquery'?{kind:'bigquery',project:'',dataset:'',tablePrefix:'cradle_',location:'US'}:{kind:'snowflake',account:'',user:'',database:'',schema:'PUBLIC',tablePrefix:'cradle_',stage:'',stageStorage:s3()})}><option value="r2">Installation R2 bucket</option><option value="s3">Your S3-compatible bucket</option><option value="bigquery">Your BigQuery dataset</option><option value="snowflake">Your Snowflake tables</option></select></label>
 {d.kind==='s3'&&<S3Fields value={d} onChange={onDestination}/>}
 {d.kind==='bigquery'&&<fieldset className="cr-stack"><legend>BigQuery destination</legend>
  <label className="cr-field">BigQuery project<input required value={d.project} onChange={event=>onDestination({...d,project:event.target.value})}/></label>
  <label className="cr-field">BigQuery dataset<input required value={d.dataset} onChange={event=>onDestination({...d,dataset:event.target.value})}/></label>
  <label className="cr-field">BigQuery table prefix<input required value={d.tablePrefix} onChange={event=>onDestination({...d,tablePrefix:event.target.value})}/></label>
  <label className="cr-field">BigQuery location<input required value={d.location} onChange={event=>onDestination({...d,location:event.target.value})}/></label>
 </fieldset>}
 {d.kind==='snowflake'&&<fieldset className="cr-stack"><legend>Snowflake destination</legend>
  <label className="cr-field">Snowflake account<input required value={d.account} onChange={event=>onDestination({...d,account:event.target.value})}/></label>
  <label className="cr-field">Snowflake user<input required value={d.user} onChange={event=>onDestination({...d,user:event.target.value})}/></label>
  <label className="cr-field">Snowflake database<input required value={d.database} onChange={event=>onDestination({...d,database:event.target.value})}/></label>
  <label className="cr-field">Snowflake schema<input required value={d.schema} onChange={event=>onDestination({...d,schema:event.target.value})}/></label>
  <label className="cr-field">Snowflake table prefix<input required value={d.tablePrefix} onChange={event=>onDestination({...d,tablePrefix:event.target.value})}/></label>
  <label className="cr-field">Snowflake stage<input required value={d.stage} onChange={event=>onDestination({...d,stage:event.target.value})}/></label>
  <label className="cr-field">Snowflake warehouse<input value={d.warehouse??''} onChange={event=>onDestination({...d,warehouse:event.target.value||undefined})}/></label>
  <label className="cr-field">Snowflake role<input value={d.role??''} onChange={event=>onDestination({...d,role:event.target.value||undefined})}/></label>
  <S3Fields stage value={d.stageStorage} onChange={stageStorage=>onDestination({...d,stageStorage})}/>
 </fieldset>}
 {(d.kind==='bigquery'||d.kind==='snowflake')&&<p>Each source table gets its own table beginning with this prefix. Loads append full or incremental rows, including deletion tombstones.</p>}
 {d.kind!=='r2'&&<>
  {hasCredentials&&<p>Credentials are saved and cannot be read back. Leave them blank to keep them, or replace all credentials for this destination.</p>}
  {d.kind==='bigquery'?<label className="cr-field">BigQuery service-account JSON<textarea required={!hasCredentials} rows={4} autoComplete="off" spellCheck={false} value={access.serviceAccountJson} onChange={event=>onAccess({...access,serviceAccountJson:event.target.value})}/></label>:<>
   {d.kind==='snowflake'&&<label className="cr-field">Snowflake private key PEM<textarea required={!hasCredentials||!!access.accessKeyId||!!access.secretAccessKey} rows={4} autoComplete="off" spellCheck={false} value={access.privateKeyPem} onChange={event=>onAccess({...access,privateKeyPem:event.target.value})}/></label>}
   <label className="cr-field">S3 access key<input type="password" autoComplete="new-password" required={!hasCredentials||!!access.secretAccessKey||!!access.privateKeyPem} value={access.accessKeyId} onChange={event=>onAccess({...access,accessKeyId:event.target.value})}/></label>
   <label className="cr-field">S3 secret key<input type="password" autoComplete="new-password" required={!hasCredentials||!!access.accessKeyId||!!access.privateKeyPem} value={access.secretAccessKey} onChange={event=>onAccess({...access,secretAccessKey:event.target.value})}/></label>
  </>}
  <p>Allow writes, reads and deletes for the destination. Remote deletion must be confirmed before Cradle confirms erasure.</p>
 </>}
 </>
}
