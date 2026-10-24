/** Scalar types keep canonical strings, like native exact-number fields. */
export function emailValue(value: unknown): string {
 if(typeof value!=='string'||value.length>254||value.split('@')[0]!.length>64||value.split('@')[1]?.split('.').some(label=>label.length>63)||/[\u0000-\u0020\u007f]/.test(value)||! /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(value)||value.startsWith('.')||value.includes('..')||value.includes('.@'))throw new Error('Email must be one valid address without control characters.')
 return value
}
export function ratingValue(value:unknown,maximum='5'):string {
 if(typeof value!=='string'||! /^(?:[1-9]|10)$/.test(value)||Number(value)>Number(maximum))throw new Error(`Rating must be a whole number from 1 to ${maximum}.`)
 return value
}
export function durationValue(value:unknown):string {
 if(typeof value!=='string'||! /^(?:0|[1-9]\d{0,15})$/.test(value)||!Number.isSafeInteger(Number(value)))throw new Error('Duration must be whole nonnegative seconds.')
 return value
}
export function durationFromText(value:string):string {
 const parts=/^(0|[1-9]\d*):([0-5]\d)(?::([0-5]\d))?$/.exec(value)
 if(!parts)return durationValue(value)
 return durationValue(String(Number(parts[1])*3600+Number(parts[2])*60+Number(parts[3]??0)))
}
export function durationText(value:string):string {
 const seconds=Number(durationValue(value)),hours=Math.floor(seconds/3600),minutes=String(Math.floor(seconds%3600/60)).padStart(2,'0'),rest=seconds%60
 return `${hours}:${minutes}${rest?':'+String(rest).padStart(2,'0'):''}`
}
