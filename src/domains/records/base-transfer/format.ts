import { ImportInputError } from './input-error'
import { canonicalJson,sha256 } from '../../../../vendor/base/modules/import-kit/src/provenance/identity'
import type { Json } from '../../../../vendor/base/modules/import-kit/src/types'
import type { NumericToken } from './contracts'
export const canonical=canonicalJson
export const hash=sha256
export const rawText=(value:Json|undefined):string=>rawCellText(value)
export function rawCellText(value:Json|undefined,tokens?:NumericToken[]):string {
 if(!tokens?.length)return value===undefined||value===null?'':typeof value==='string'?value:typeof value==='number'||typeof value==='boolean'?String(value):JSON.stringify(value)
 const byPath=new Map(tokens.map(token=>[JSON.stringify(token.path),token.lexeme]))
 const encode=(cell:Json|undefined,path:(string|number)[]):string=>{const token=byPath.get(JSON.stringify(path));if(token!==undefined){if(cell!==token)throw new ImportInputError('API numeric token provenance does not match cell');return token}if(Array.isArray(cell))return '['+cell.map((item,index)=>encode(item,[...path,index])).join(',')+']';if(cell&&typeof cell==='object')return '{'+Object.entries(cell).map(([key,item])=>JSON.stringify(key)+':'+encode(item,[...path,key])).join(',')+'}';return JSON.stringify(cell)??''}
 return encode(value,[])
}
export const nonempty=(value:Json|undefined)=>value!==undefined&&value!==null&&value!==''&&!(Array.isArray(value)&&value.length===0)
/** Cell characters are Unicode code points, including CR and LF independently. */
export const cellCharacters=(value:string)=>Array.from(value).length
export function limit(name:string,value:number,current:number,filename:string,line:number):void {if(current>value)throw new ImportInputError(`${filename} LINE ${line}: LIMIT ${name} value ${value} CURRENT ${current}`)}

export function stableOptionId(appId:string,tableKey:string,columnKey:string,label:string):string {
 const alphabet='0123456789ABCDEFGHJKMNPQRSTVWXYZ';let value=BigInt('0x'+hash(canonical([appId,tableKey,columnKey,label]))),out=''
 for(let i=0;i<26;i++){out=alphabet[Number(value&31n)]+out;value>>=5n}return appId.slice(0,10)+out.slice(-16)
}
