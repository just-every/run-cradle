import { inventoryTables } from './template-inventory'
import { vendorTables } from './template-vendors'
import { assetTables } from './template-assets'
import { eventTables } from './template-events'
import { fieldOperationsTables } from './template-field-operations'
import { contentTables } from './template-content'

export const operationsTemplates=[
 {id:'inventory',name:'Inventory and orders',description:'Products, orders and line items, with stock levels, USD prices and shipping dates.',tables:inventoryTables},
 {id:'vendors',name:'Vendor and contract register',description:'Vendors, contracts and reviews, with renewal dates, USD values and approval tracking.',tables:vendorTables},
 {id:'assets',name:'Asset and equipment register',description:'Locations, assets and maintenance, with custodians, warranties and USD costs.',tables:assetTables},
 {id:'events',name:'Event planning',description:'Venues, events and tasks, with budgets, booking details and due dates.',tables:eventTables},
 {id:'field-operations',name:'Field operations tracker',description:'Sites, jobs and visits, with technician assignments, arrival times and work status.',tables:fieldOperationsTables},
 {id:'content',name:'Content production',description:'Campaigns, content and production tasks, with owners, approvals and publishing dates.',tables:contentTables},
]
