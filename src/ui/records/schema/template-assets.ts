import type { SchemaDraft } from '../../../domains/records/manual/contracts'
import { newField as field,templateFields } from './template-fields'
export function assetTables(appId:string):SchemaDraft['tables']{
 const {table,select,link,lookup}=templateFields(appId)
 const locations=table('Locations',[field('Location'),field('Address'),field('Contact'),field('Phone')])
 const location=link('Location',locations)
 const assets=table('Assets',[field('Asset'),field('Asset tag'),field('Serial number'),select('Condition',['Ready','In use','Maintenance','Retired']),location,field('Custodian','person'),field('Purchase date','date'),field('Purchase cost','money'),field('Warranty ends','date'),lookup('Location address',location,locations.fields[1]!)])
 const asset=link('Asset',assets)
 return [locations,assets,table('Maintenance',[field('Work order'),asset,field('Due date','date'),select('Status',['Scheduled','In progress','Complete']),field('Cost','money'),field('Completed date','date'),field('Notes')])]
}
