import type {CellValue,StoreReference} from '../../../contracts/primitives'
import {isStoreReferenceMember} from '../store-references'
import {exportStoreReference} from '../portable-store-references'
import {AdmissionError} from '../../admission/errors'

/** Existing complete-base policy and snapshot guards fence these field values. */
export async function exportStoreCell(db:D1Database,label:string,value:CellValue){
 if(!Array.isArray(value)||value.some(member=>!isStoreReferenceMember(member)))throw new AdmissionError('validation',`${label}: uploaded attachment bytes have no base JSON representation.`)
 return Promise.all(value.map(async member=>{
  const reference=(member as {reference:StoreReference}).reference
  const person=await db.prepare("SELECT o.name FROM operators o JOIN authority_principals p ON p.id=o.id WHERE p.id=? AND p.state='erased'").bind(reference.attachedBy).first<{name:string}>()
  try{return exportStoreReference(reference,person?.name)}catch(error){throw new AdmissionError('validation',`${label}: ${(error as Error).message}`)}
 }))
}
