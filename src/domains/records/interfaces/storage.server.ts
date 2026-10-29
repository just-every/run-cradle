import {registerTable,trustedPredicate} from '../../admission/sql.server'

export type StoredInterface={id:string;app_id:string;author_id:string|null;version:number;definition_json:string;created_at:string;updated_at:string;deleted_at:number|null;expires_at:number|null}
export const interfaces=registerTable('record_interfaces',['id','app_id','author_id','version','definition_json','created_at','updated_at','deleted_at','expires_at'])
export const interfaceVersions=registerTable('record_interface_versions',['interface_id','version','author_id','definition_json','created_at'])
export const interfaceGuard=(row:StoredInterface)=>trustedPredicate('EXISTS(SELECT 1 FROM record_interfaces WHERE id=? AND app_id=? AND version=? AND definition_json=? AND deleted_at IS ?)',[row.id,row.app_id,row.version,row.definition_json,row.deleted_at])
export const interfaceUnavailable=(error:unknown)=>error instanceof Error&&'code'in error&&['forbidden','not_found','grant_expired','grant_revoked','signed_out','schema_conflict','version_conflict'].includes(String(error.code))
