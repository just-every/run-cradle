import { durationFromText } from './typed-values'
import { AdmissionError } from '../admission/errors'
import type { Field } from './contracts'
import { parseLinkCell } from './base-transfer/parse'

/** Human CSV conversions use decimal strings throughout; no floating point rounding. */
export function typedCsvValue(field:Field,raw:string):unknown {
 const text=raw.trim()
 if(field.type==='duration'){try{return durationFromText(text)}catch(error){throw new AdmissionError('validation',`${field.label}: ${(error as Error).message}`)}}
 if(field.type==='date'&&/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text)){
  const [month,day,year]=text.split('/');return `${year}-${month!.padStart(2,'0')}-${day!.padStart(2,'0')}`
 }
 if(field.type==='date')return text
 if(field.type==='boolean'){
  if(/^(true|yes|y|checked|1)$/i.test(text))return true
  if(/^(false|no|n|unchecked|0)$/i.test(text))return false
 }
 if(field.type==='number'||field.type==='money'){
  if(field.type==='money'&&text.startsWith('{')){try{return JSON.parse(text)}catch{throw new AdmissionError('validation',`${field.label}: invalid exported money value.`)}}
  const match=/^(-?)\$?((?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+))(?:\.(\d+))?$/.exec(text)
  if(match){
   const whole=match[2]!.replaceAll(',',''),fraction=match[3]??'',negative=match[1]
   if(field.type==='number')return `${negative}${whole}${fraction?'.'+fraction:''}`.replace(/^-0$/, '0')
   // Human dollar amounts are USD cents. Preserve exported currency/scale JSON separately.
   if(fraction.length>2)throw new AdmissionError('validation',`${field.label}: USD amounts support at most two decimal places.`)
   if(whole.length>128)throw new AdmissionError('validation',`${field.label}: amount exceeds supported precision.`)
   const minor=BigInt(whole+fraction.padEnd(2,'0'))*(negative?-1n:1n)
   return {minor:String(minor),currency:'USD',scale:2}
  }
 }
 if(field.type==='multi_select'){
  if(!text)return []
  let labels:string[]
  try{labels=text.startsWith('[')?JSON.parse(text):text.startsWith('"')?parseLinkCell(text):text.includes(';')?text.split(';'):parseLinkCell(text)}catch{throw new AdmissionError('validation',`${field.label}: use comma or semicolon separated options, or an exported JSON list.`)}
  if(!Array.isArray(labels)||labels.some(label=>typeof label!=='string'))throw new AdmissionError('validation',`${field.label}: expected a list of options.`)
  return labels.map(label=>{
   const exact=field.options?.filter(option=>option.label===label||option.id===label)??[]
   const matches=exact.length?exact:field.options?.filter(option=>option.label===label.trim()||option.id===label.trim())??[]
   if(matches.length!==1)throw new AdmissionError('validation',`${field.label}: ${JSON.stringify(label)} is not one unambiguous option.`)
   return matches[0]!.id
  })
 }
 return raw
}
