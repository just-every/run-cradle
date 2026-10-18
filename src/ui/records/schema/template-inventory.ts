import type { SchemaDraft } from '../../../domains/records/manual/contracts'
import { newField as field,templateFields } from './template-fields'
export function inventoryTables(appId:string):SchemaDraft['tables']{
 const {table,select,link,lookup}=templateFields(appId)
 const products=table('Products',[field('Product'),field('SKU'),field('Unit price','money'),field('On hand','number'),field('Reorder point','number'),field('Active','boolean')])
 const orders=table('Orders',[field('Order'),field('Customer'),select('Status',['Draft','Confirmed','Shipped','Cancelled']),field('Order date','date'),field('Ship by','date'),field('Shipping address')])
 const product=link('Product',products),order=link('Order',orders)
 return [products,orders,table('Order lines',[field('Line item'),order,product,field('Quantity','number'),field('Unit price','money'),lookup('Product SKU',product,products.fields[1]!)])]
}
