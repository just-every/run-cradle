import {unzipWorkbook,bound,reject} from './zip'
import {xml,elements,children,spreadsheet,relationships,officeRelationships,numberFormat,isPercentFormat,excelDate} from './xml'
export type WorkbookCell={value:string|boolean|null;type:'text'|'number'|'date'|'instant'|'boolean';formula?:string;percent?:true}
export type WorkbookSheet={name:string;headers:string[];rows:WorkbookCell[][]}
export function readWorkbook(bytes:Uint8Array,filename:string):WorkbookSheet[]{
 const files=unzipWorkbook(bytes,filename),types=xml(files.get('[Content_Types].xml'),'[Content_Types].xml')
 if(/macroEnabled|vbaProject/.test(types.toString()))reject('Macro-enabled workbooks are not supported. Save a macro-free .xlsx copy.')
 const workbook=xml(files.get('xl/workbook.xml'),'xl/workbook.xml'),links=xml(files.get('xl/_rels/workbook.xml.rels'),'workbook relationships'),date1904=['1','true'].includes(elements(workbook,'workbookPr')[0]?.getAttribute('date1904')??'')
 const parts=new Map<string,string>();for(const link of elements(links,'Relationship',relationships)){
  if(link.getAttribute('TargetMode')==='External')reject('External workbook relationships are not supported. Save a self-contained workbook.')
  const target=link.getAttribute('Target')??'',path=target.startsWith('/')?target.slice(1):'xl/'+target
  if(path.includes('..')||path.includes('\\'))reject('Unsafe workbook relationship path.');parts.set(link.getAttribute('Id')!,path)
 }
 const strings=files.has('xl/sharedStrings.xml')?elements(xml(files.get('xl/sharedStrings.xml'),'shared strings'),'si').map(si=>elements(si,'t').map(t=>t.textContent??'').join('')):[]
 const styles=files.has('xl/styles.xml')?xml(files.get('xl/styles.xml'),'styles'):null,formats=new Map(styles?elements(styles,'numFmt').map(f=>[Number(f.getAttribute('numFmtId')),f.getAttribute('formatCode')??'']):[]),xfs=styles?children(elements(styles,'cellXfs')[0]??styles.documentElement!,'xf'):[]
 const sheets=elements(workbook,'sheet');bound('sheets',sheets.length);if(!sheets.length)reject('Workbook contains no worksheets.')
 const names=new Set<string>()
 return sheets.map(sheet=>{
  const name=sheet.getAttribute('name')??'';if(!name||names.has(name))reject('Worksheet names must be nonempty and unique.');names.add(name)
  const path=parts.get(sheet.getAttributeNS(officeRelationships,'id')??'');if(!path)reject('Worksheet relationship is missing.')
  const document=xml(files.get(path),path),rows=elements(document,'row');bound('rows',rows.length-1)
  const grid:WorkbookCell[][]=[];let previous=0
  for(const row of rows){const rowNumber=Number(row.getAttribute('r'));if(!Number.isInteger(rowNumber)||rowNumber<=previous)reject('Worksheet rows must have increasing row numbers.');bound('rows',rowNumber-1);previous=rowNumber
   const cells:WorkbookCell[]=[]
   for(const cell of children(row,'c')){const address=cell.getAttribute('r')?.match(/^([A-Z]+)([1-9]\d*)$/);if(!address||Number(address[2])!==rowNumber)reject('Worksheet cell address is invalid.');let column=0;for(const letter of address[1]!)column=column*26+letter.charCodeAt(0)-64;bound('columns',column);if(cells[column-1])reject('Duplicate worksheet cell.')
    const type=cell.getAttribute('t'),value=children(cell,'v')[0]?.textContent??'',formula=children(cell,'f')[0]?.textContent??undefined,style=Number(cell.getAttribute('s')??0),formatId=Number(xfs[style]?.getAttribute('numFmtId')??0)
    let result:WorkbookCell={value:null,type:'text'}
    if(type==='s'){if(!/^\d+$/.test(value)||strings[Number(value)]===undefined)reject('Invalid shared-string reference.');result={value:strings[Number(value)]!,type:'text'}}
    else if(type==='inlineStr')result={value:elements(cell,'t').map(t=>t.textContent??'').join(''),type:'text'}
    else if(type==='str')result={value,type:'text'}
    else if(type==='b'){if(!['0','1'].includes(value))reject('Invalid workbook boolean.');result={value:value==='1',type:'boolean'}}
    else if(type==='d'){const instant=new Date(value);if(!Number.isFinite(instant.getTime()))reject('Invalid workbook date.');result={value:/T/.test(value)?instant.toISOString():instant.toISOString().slice(0,10),type:/T/.test(value)?'instant':'date'}}
    else if(type==='e')reject('Workbook contains an Excel error cell. Recalculate and correct it before importing.')
    else if(value!==''){if(!/^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value))reject('Invalid workbook number.');const kind=numberFormat(formatId,formats.get(formatId));result={value:kind==='number'?value:excelDate(value,kind,date1904),type:kind,...(isPercentFormat(formatId,formats.get(formatId))?{percent:true as const}:{})}}
    else if(formula!==undefined)reject('Formula cell has no cached value. Recalculate and save the workbook in Excel first.')
    cells[column-1]={...result,...(formula!==undefined?{formula}:{})}
   }
   grid[rowNumber-1]=cells
  }
  const first=grid[0];if(!first?.length)reject('Each worksheet needs a header row at row 1.')
  const headers=Array.from({length:first.length},(_,i)=>String(first[i]?.value??'').trim());if(headers.some(h=>!h)||new Set(headers).size!==headers.length)reject('Worksheet headers must be nonempty and unique.')
  const data=Array.from({length:Math.max(0,grid.length-1)},(_,i)=>{const cells=grid[i+1]??[];if(cells.length>headers.length)reject('Worksheet has cells beyond its header columns.');return headers.map((_,j)=>cells[j]??{value:null,type:'text' as const})})
  return {name,headers,rows:data}
 })
}
