import { localParts } from '../../domains/channels/clock'
const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
export function parseSchedule(rule:string) {
 if(rule==='hourly')return {frequency:'hourly' as const,weekday:null,minute:0,time:''}
 const match=/^(daily|weekly ([0-6])) ((?:[01]\d|2[0-3]):[0-5]\d)$/.exec(rule)
 if(!match)return null
 return {frequency:match[2]?'weekly' as const:'daily' as const,weekday:match[2]?Number(match[2]):null,
  minute:Number(match[3]!.slice(0,2))*60+Number(match[3]!.slice(3)),time:match[3]!}
}
export function describeSchedule(rule:string,zone:string) {
 const parsed=parseSchedule(rule)
 if(!parsed)return 'Schedule needs configuration'
 return parsed.frequency==='hourly'?`Every hour · ${zone}`:
  `${parsed.weekday===null?'Every day':`Every ${weekdays[parsed.weekday]}`} at ${parsed.time} · ${zone}`
}
/** Match an actual recent local minute, preserving its date across midnight and DST. */
export function dueSchedule(at:number,zone:string,rule:string):string|null {
 const parsed=parseSchedule(rule)
 if(!parsed)return null
 for(let offset=0;offset<15;offset++) {
  const local=localParts(Math.floor(at/60000)*60000-offset*60000,zone)
  if(parsed.frequency==='hourly'?local.minute%60!==0:local.minute!==parsed.minute)continue
  if(parsed.weekday!==null&&local.weekday!==weekdays[parsed.weekday]!.slice(0,3))continue
  return local.date+(parsed.frequency==='hourly'?`T${String(Math.floor(local.minute/60)).padStart(2,'0')}`:'')
 }
 return null
}
