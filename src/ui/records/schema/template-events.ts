import type { SchemaDraft } from '../../../domains/records/manual/contracts'
import { newField as field,templateFields } from './template-fields'
export function eventTables(appId:string):SchemaDraft['tables']{
 const {table,select,link,lookup}=templateFields(appId)
 const venues=table('Venues',[field('Venue'),field('Address'),field('Capacity','number'),field('Contact email'),field('Booking cost','money')])
 const venue=link('Venue',venues)
 const events=table('Events',[field('Event'),venue,field('Start date','date'),field('End date','date'),field('Budget','money'),field('Organizer','person'),select('Status',['Planning','Confirmed','Live','Complete','Cancelled']),lookup('Venue address',venue,venues.fields[1]!)])
 const event=link('Event',events)
 return [venues,events,table('Event tasks',[field('Task'),event,field('Owner','person'),field('Due date','date'),select('Status',['To do','In progress','Done']),field('Estimated cost','money'),field('Notes')])]
}
