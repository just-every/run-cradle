import {localParts,minute} from '../channels/clock'
import type {UserSchedule} from './trigger-contracts'
/** Ordinals describe local wall-clock minutes. Repeated DST minutes therefore
 * keep one identity, and missed slots coalesce to the latest eligible slot. */
export function localOrdinal(at:number,zone:string){const local=localParts(at,zone);return Date.parse(local.date+'T00:00:00Z')/60000+local.minute}
export function scheduleSlot(at:number,zone:string,startsAt:string,schedule:UserSchedule):number|null{
 const start=Date.parse(startsAt);if(at<start)return null
 const now=localOrdinal(at,zone),first=localOrdinal(start,zone),local=localParts(at,zone),[year,month]=local.date.split('-').map(Number),midnight=now-local.minute
 let slot:number
 if(schedule.unit==='minutes')slot=first+Math.floor((now-first)/schedule.every)*schedule.every
 else if(schedule.unit==='hourly')slot=Math.floor(now/60)*60+schedule.minute-(local.minute%60<schedule.minute?60:0)
 else if(schedule.unit==='daily')slot=midnight+minute(schedule.time)-(local.minute<minute(schedule.time)?1440:0)
 else if(schedule.unit==='weekly'){
  const weekday=new Date(local.date+'T00:00:00Z').getUTCDay(),back=(weekday-schedule.weekday+7)%7
  slot=midnight-back*1440+minute(schedule.time);if(slot>now)slot-=7*1440
 }else{
  slot=-Infinity
  for(let back=0;back<14;back++){
   const base=new Date(Date.UTC(year,month-1-back,1)),candidate=new Date(Date.UTC(base.getUTCFullYear(),base.getUTCMonth(),schedule.day))
   if(candidate.getUTCMonth()!==base.getUTCMonth())continue
   const value=candidate.getTime()/60000+minute(schedule.time)
   if(value<=now){slot=value;break}
  }
 }
 return slot>=first?slot:null
}
export function offsetCalendarDate(date:string,days:number){const at=new Date(date+'T00:00:00Z');at.setUTCDate(at.getUTCDate()+days);if(!Number.isFinite(at.getTime()))throw new Error('Date offset is outside the supported calendar.');const value=at.toISOString().slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('Date offset is outside the supported calendar.');return value}
