import type {RecordAutomationDefinition} from './contracts'
export function automationTriggerLabel(definition:RecordAutomationDefinition){
 const trigger=definition.trigger
 if(!trigger)return definition.event==='created'?'Record created':'Record updated'
 if(trigger.kind==='fields_updated')return 'Record updated · selected fields'
 if(trigger.kind==='date_offset')return `Date offset · ${Math.abs(trigger.offsetDays)} days ${trigger.offsetDays<0?'before':'after'}`
 const schedule=trigger.schedule
 return schedule.unit==='minutes'?`Scheduled · every ${schedule.every} minutes`:`Scheduled · ${schedule.unit}`
}
