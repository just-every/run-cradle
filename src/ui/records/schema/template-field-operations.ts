import type { SchemaDraft } from '../../../domains/records/manual/contracts'
import { newField as field,templateFields } from './template-fields'
export function fieldOperationsTables(appId:string):SchemaDraft['tables']{
 const {table,select,link,lookup}=templateFields(appId)
 const sites=table('Sites',[field('Site'),field('Address'),field('Contact name'),field('Contact phone'),field('Access instructions')])
 const site=link('Site',sites)
 const jobs=table('Jobs',[field('Job'),site,field('Technician','person'),field('Scheduled date','date'),select('Priority',['Routine','High','Urgent']),select('Status',['Requested','Scheduled','On site','Complete','Cancelled']),field('Estimated cost','money'),lookup('Site address',site,sites.fields[1]!)])
 const job=link('Job',jobs)
 return [sites,jobs,table('Visits',[field('Visit'),job,field('Arrived at','instant'),field('Departed at','instant'),field('Work completed','boolean'),field('Labor hours','number'),field('Notes')])]
}
