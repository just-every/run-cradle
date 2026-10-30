import type {SourceFormula,SourceTable} from './contracts'

export type WorkbookLookup={relationColumnKey:string;valueColumnKey:string;targetTableKey:string}
const columnIndex=(letters:string)=>[...letters.toUpperCase()].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1
export const isWorkbookLookup=(formula:SourceFormula)=>/^=?(?:_xlfn\.)?(?:VLOOKUP|XLOOKUP)\s*\(/i.test(formula.expression.trim())
/** Exact, forward lookups only; partial ranges and missing-value replacements keep their caches. */
export function workbookLookup(formula:SourceFormula,row:number,table:SourceTable,tables:SourceTable[],primary:(table:SourceTable)=>string):WorkbookLookup {
 if(formula.kind)throw new Error(`Unsupported ${formula.kind} formula`)
 const match=/^=?(?:_xlfn\.)?(VLOOKUP|XLOOKUP)\s*\((.*)\)$/i.exec(formula.expression.trim())
 if(!match)throw new Error('Unsupported lookup formula')
 const args:string[]=[];let start=0,quoted=false
 for(let i=0;i<match[2].length;i++){
  const char=match[2][i]
  if(char==="'"){if(quoted&&match[2][i+1]==="'"){i++;continue}quoted=!quoted}
  if(!quoted&&char===','){args.push(match[2].slice(start,i).trim());start=i+1}
 }
 if(quoted)throw new Error('Unclosed worksheet name')
 args.push(match[2].slice(start).trim())
 const ref=/^\$?([A-Z]+)\$?([1-9]\d*)$/i.exec(args[0])
 if(!ref||Number(ref[2])!==row)throw new Error('Lookup key must reference a same-row source field')
 const link=table.columns[columnIndex(ref[1])]
 if(!link||link.key===primary(table))throw new Error('Lookup key must be a non-primary source field')
 function range(text:string){
  const r=/^(?:('(?:[^']|'')+'|[^!\[\]]+)!)?\$?([A-Z]+)\$?([1-9]\d*):\$?([A-Z]+)\$?([1-9]\d*)$/i.exec(text)
  if(!r)throw new Error('Lookup needs a bounded range in an imported worksheet')
  const name=r[1]?.replace(/^'|'$/g,'').replace(/''/g,"'")??table.label,target=tables.find(t=>t.label===name)
  if(!target)throw new Error('Lookup references a worksheet outside this import')
  if(Number(r[3])!==2||Number(r[5])!==target.rows.length+1)throw new Error('Lookup range must cover every imported data row, without headers')
  const first=columnIndex(r[2]),last=columnIndex(r[4])
  if(first>last||!target.columns[first]||!target.columns[last])throw new Error('Lookup range is outside the imported columns')
  return {target,first,last}
 }
 let search:ReturnType<typeof range>,value:ReturnType<typeof range>
 if(match[1].toUpperCase()==='VLOOKUP'){
  if(args.length!==4||! /^(?:FALSE|0)$/i.test(args[3]))throw new Error('VLOOKUP requires explicit exact matching; approximate matches are not preserved')
  search=range(args[1]);const index=Number(args[2])
  if(!/^\d+$/.test(args[2])||index<1||search.first+index-1>search.last)throw new Error('VLOOKUP result index is outside the selected range')
  value={...search,first:search.first+index-1,last:search.first+index-1}
 }else{
  if(args.length<3||args.length>6||args[3]||args[4]&&!/^0$/.test(args[4])||args[5]&&!/^1$/.test(args[5]))throw new Error('XLOOKUP requires exact forward matching without a missing-value replacement')
  search=range(args[1]);value=range(args[2])
  if(search.first!==search.last||value.first!==value.last||search.target.key!==value.target.key)throw new Error('XLOOKUP needs aligned single-column ranges in one worksheet')
 }
 if(search.target.columns[search.first].key!==primary(search.target))throw new Error('Lookup search column must be the reviewed target primary field')
 return {relationColumnKey:link.key,valueColumnKey:value.target.columns[value.first].key,targetTableKey:search.target.key}
}
