import type {XmlDocument} from '../../../core/shared/xml-types'
import {children,elements} from './xml'

/** Resolve Excel's vertical fill groups; other shared layouts retain their refusal. */
export function sharedWorkbookFormulas(document:XmlDocument):Map<string,string>{
 const groups=new Map<string,{coordinate:string;expression:string;range:string|null}[]>()
 for(const cell of elements(document,'c')){
  const formula=children(cell,'f')[0],index=formula?.getAttribute('si')
  if(formula?.getAttribute('t')!=='shared'||!index||!/^\d+$/.test(index))continue
  const members=groups.get(index)??[]
  members.push({coordinate:cell.getAttribute('r')??'',expression:formula.textContent??'',range:formula.getAttribute('ref')||null})
  groups.set(index,members)
 }
 const resolved=new Map<string,string>()
 for(const members of groups.values()){
  const masters=members.filter(member=>member.expression.trim())
  if(masters.length!==1)continue
  const master=masters[0],range=/^([A-Z]+)([1-9]\d*):([A-Z]+)([1-9]\d*)$/.exec(master.range??'')
  if(!range||range[1]!==range[3]||Number(range[2])>Number(range[4])||master.coordinate!==range[1]+range[2])continue
  if(members.some(member=>{
   const coordinate=/^([A-Z]+)([1-9]\d*)$/.exec(member.coordinate)
   return !coordinate||coordinate[1]!==range[1]||Number(coordinate[2])<Number(range[2])||Number(coordinate[2])>Number(range[4])||member!==master&&member.range!==null
  }))continue
  const translated=new Map<string,string>()
  try{
   for(const member of members){
    const delta=Number(member.coordinate.slice(range[1].length))-Number(range[2])
    // Quoted literals and worksheet names are opaque; dollar-prefixed rows stay fixed.
    const expression=master.expression.replace(/"(?:[^"]|"")*"|'(?:[^']|'')*'|(?<![A-Za-z0-9_.])(\$?[A-Za-z]{1,3})(\$?)([1-9]\d*)(?![A-Za-z0-9_.]|\s*[!(])/g,(token,column:string|undefined,absolute:string,row:string)=>{
     if(column===undefined||absolute)return token
     const shifted=Number(row)+delta
     if(shifted<1||shifted>1048576)throw new Error('Shared reference is outside the worksheet')
     return column+shifted
    })
    translated.set(member.coordinate,expression)
   }
  }catch{continue}
  for(const [coordinate,expression]of translated)resolved.set(coordinate,expression)
 }
 return resolved
}
