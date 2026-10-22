import {zipFiles} from '../base-transfer/export-zip'
import {bound,reject} from './zip'
import {escapeXml,spreadsheet,officeRelationships,relationships} from './xml'
import type {WorkbookCell,WorkbookSheet} from './read'
export type ExportCell=WorkbookCell&{format?:'currency'|'percentage';currency?:string}
export type ExportSheet=Omit<WorkbookSheet,'rows'>&{rows:ExportCell[][]}
const column=(value:number)=>{let result='';for(let n=value+1;n;n=Math.floor((n-1)/26))result=String.fromCharCode(65+(n-1)%26)+result;return result}
export function writeWorkbook(sheets:ExportSheet[]):Uint8Array{
 bound('sheets',sheets.length);if(!sheets.length)reject('A workbook needs at least one sheet.')
 const files:{name:string;bytes:Uint8Array}[]=[],encoder=new TextEncoder(),names=new Set<string>(),add=(name:string,xml:string)=>files.push({name,bytes:encoder.encode('<?xml version="1.0" encoding="UTF-8"?>'+xml)})
 const labels=sheets.map(sheet=>{let name=sheet.name.replace(/[\\/?*\[\]:]/g,' ').slice(0,31)||'Table',n=2;while(names.has(name.toLowerCase()))name=sheet.name.slice(0,25)+' '+n++;names.add(name.toLowerCase());return name})
 const currencies=[...new Set(sheets.flatMap(s=>s.rows.flatMap(r=>r.filter(c=>c.format==='currency').map(c=>c.currency??'USD'))))]
 const currencyStyles=new Map(currencies.map((code,i)=>[code,i+5]))
 const parts=sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
 add('[Content_Types].xml',`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${parts}</Types>`)
 add('_rels/.rels',`<Relationships xmlns="${relationships}"><Relationship Id="rId1" Type="${officeRelationships}/officeDocument" Target="xl/workbook.xml"/></Relationships>`)
 add('xl/workbook.xml',`<workbook xmlns="${spreadsheet}" xmlns:r="${officeRelationships}"><sheets>${sheets.map((_,i)=>`<sheet name="${escapeXml(labels[i]!)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`)
 add('xl/_rels/workbook.xml.rels',`<Relationships xmlns="${relationships}">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="${officeRelationships}/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="styles" Type="${officeRelationships}/styles" Target="styles.xml"/></Relationships>`)
 add('xl/styles.xml',`<styleSheet xmlns="${spreadsheet}"><numFmts count="${2+currencies.length}">${currencies.map((code,i)=>`<numFmt numFmtId="${166+i}" formatCode="&quot;${escapeXml(code)}&quot; #,##0.00"/>`).join('')}<numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm:ss"/><numFmt numFmtId="165" formatCode="&quot;$&quot;#,##0.00"/></numFmts><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${5+currencies.length}">${[0,14,164,165,10,...currencies.map((_,i)=>166+i)].map(id=>`<xf numFmtId="${id}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`).join('')}</cellXfs></styleSheet>`)
 sheets.forEach((sheet,index)=>{bound('rows',sheet.rows.length);bound('columns',sheet.headers.length)
  const rows:ExportCell[][]=[sheet.headers.map(value=>({value,type:'text'})),...sheet.rows]
  const cell=(value:ExportCell,address:string)=>{if(value.value===null)return `<c r="${address}"/>`;if(value.type==='boolean')return `<c r="${address}" t="b"><v>${value.value?1:0}</v></c>`
   if(value.type==='number'){if(!/^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(String(value.value)))reject('Invalid numeric workbook export value.');return `<c r="${address}" s="${value.format==='currency'?currencyStyles.get(value.currency??'USD')!:value.format==='percentage'?4:0}"><v>${value.value}</v></c>`}
   if(value.type==='date'||value.type==='instant'){const ms=Date.parse(String(value.value));if(!Number.isFinite(ms))reject('Invalid date workbook export value.');const serial=(ms-Date.UTC(1899,11,30))/86400000;return `<c r="${address}" s="${value.type==='date'?1:2}"><v>${serial<61?serial-1:serial}</v></c>`}
   // Literal strings retain CSV's exact characters, including = + - @, without formula execution.
   return `<c r="${address}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value.value))}</t></is></c>`
  }
  add(`xl/worksheets/sheet${index+1}.xml`,`<worksheet xmlns="${spreadsheet}"><sheetData>${rows.map((row,i)=>`<row r="${i+1}">${row.map((v,j)=>cell(v,column(j)+(i+1))).join('')}</row>`).join('')}</sheetData></worksheet>`)
 })
 const bytes=zipFiles(files,true);bound('bytes',bytes.length);return bytes
}
