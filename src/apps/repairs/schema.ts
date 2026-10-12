import { registerTable } from '../../domains/admission/sql.server';
import { REPAIR_MODEL, type RepairEntity } from './model';
export const repairTables=Object.fromEntries(Object.entries(REPAIR_MODEL).map(([key,value])=>[key,registerTable(value.table,['id','version','created_at','updated_at','lifecycle','schema_version',...value.fields.filter(f=>f.type!=='attachment').map(f=>f.name)])])) as Record<RepairEntity,ReturnType<typeof registerTable>>;
export const repairConfigurationTable=registerTable('repair_configuration',['app_id','manager_id','release_id','version','created_at','updated_at']);
