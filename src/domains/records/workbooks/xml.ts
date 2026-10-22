import type {XmlElement as Element,XmlDocument as Document} from '../../../core/shared/xml-types'
import {DOMParser} from '@xmldom/xmldom'
import {reject} from './zip'
export const spreadsheet='http://schemas.openxmlformats.org/spreadsheetml/2006/main',relationships='http://schemas.openxmlformats.org/package/2006/relationships',officeRelationships='http://schemas.openxmlformats.org/officeDocument/2006/relationships'
export function xml(bytes:Uint8Array|undefined,part:string){if(!bytes)reject('Workbook is missing '+part);const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(/<!DOCTYPE|<!ENTITY/i.test(text))reject('Workbook XML entities are not supported.');return new DOMParser({errorHandler:{warning:()=>reject('Malformed workbook XML in '+part),error:()=>reject('Malformed workbook XML in '+part),fatalError:()=>reject('Malformed workbook XML in '+part)}}).parseFromString(text,'application/xml') as unknown as Document}
export const elements=(node:Document|Element,name:string,namespace=spreadsheet)=>Array.from(node.getElementsByTagNameNS(namespace,name))
export const children=(node:Element,name:string)=>Array.from(node.childNodes).filter((child):child is Element=>child.nodeType===1&&(child as Element).namespaceURI===spreadsheet&&(child as Element).localName===name)
export const escapeXml=(value:string)=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;')
export function numberFormat(id:number,custom:string|undefined){
 const format=(custom??'').replace(/"[^"]*"|\\.|\[[^\]]*\]/g,'').toLowerCase()
 if([14,15,16,17].includes(id)||/[yd]/.test(format))return /[hs]/.test(format)||id===22?'instant':'date'
 if([18,19,20,21,22,45,46,47].includes(id)||/[hs]/.test(format))return 'instant'
 return 'number'
}
export function excelDate(value:string,kind:string,date1904:boolean){const serial=Number(value);if(!Number.isFinite(serial)||serial<0||serial>2958465)reject('Excel date serial is outside the supported calendar.');if(!date1904&&Math.floor(serial)===60)reject('Excel serial day 60 is not a real calendar date. Correct it before import.');const epoch=date1904?Date.UTC(1904,0,1):Date.UTC(1899,11,serial<60?31:30);const date=new Date(epoch+Math.round(serial*86400000));return kind==='date'?date.toISOString().slice(0,10):date.toISOString()}
