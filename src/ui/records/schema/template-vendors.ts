import type { SchemaDraft } from '../../../domains/records/manual/contracts'
import { newField as field,templateFields } from './template-fields'
export function vendorTables(appId:string):SchemaDraft['tables']{
 const {table,select,link,lookup}=templateFields(appId)
 const vendors=table('Vendors',[field('Vendor'),field('Contact name'),field('Email'),field('Phone'),field('Website','url'),select('Status',['Prospective','Approved','Inactive'])])
 const vendor=link('Vendor',vendors)
 const contracts=table('Contracts',[field('Contract'),vendor,select('Status',['Draft','Active','Renewal due','Expired']),field('Start date','date'),field('Renewal date','date'),field('Annual value','money'),field('Agreement URL','url'),lookup('Vendor email',vendor,vendors.fields[2]!)])
 const contract=link('Contract',contracts)
 return [vendors,contracts,table('Reviews',[field('Review'),contract,field('Review date','date'),field('Owner','person'),field('Approved','boolean'),field('Notes')])]
}
