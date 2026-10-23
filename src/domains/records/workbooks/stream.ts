import {escapeXml,spreadsheet,officeRelationships,relationships} from './xml'
import type {ExportCell} from './write'
import {streamZip,type StreamEntry} from './stream-zip'
export type StreamSheet={name:string;headers:string[];rows:AsyncIterable<ExportCell[]>}
const encoder=new TextEncoder(),xml=(text:string)=>encoder.encode(text)
const column=(value:number)=>{let result='';for(let n=value+1;n;n=Math.floor((n-1)/26))result=String.fromCharCode(65+(n-1)%26)+result;return result}
const currencies=Intl.supportedValuesOf('currency'),currencyStyles=new Map(currencies.map((code,i)=>[code,i+5]))
function cell(value:ExportCell,address:string):string{
 if(value.value===null)return `<c r="${address}"/>`
 if(value.type==='boolean')return `<c r="${address}" t="b"><v>${value.value?1:0}</v></c>`
 if(value.type==='number'){if(!/^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(String(value.value)))throw Error('Invalid numeric workbook export value');const style=value.format==='currency'?currencyStyles.get(value.currency??'USD'):value.format==='percentage'?4:0;if(style===undefined)throw Error('Unsupported workbook currency');return `<c r="${address}" s="${style}"><v>${value.value}</v></c>`}
 if(value.type==='date'||value.type==='instant'){const ms=Date.parse(String(value.value));if(!Number.isFinite(ms))throw Error('Invalid workbook date');const serial=(ms-Date.UTC(1899,11,30))/86400000;return `<c r="${address}" s="${value.type==='date'?1:2}"><v>${serial<61?serial-1:serial}</v></c>`}
 return `<c r="${address}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value.value))}</t></is></c>`
}
async function* text(value:string){yield xml('<?xml version="1.0" encoding="UTF-8"?>'+value)}
/** Export limits are Excel/ZIP limits, independent of hostile-input intake limits. */
export async function* streamWorkbook(sheets:StreamSheet[]):AsyncGenerator<Uint8Array>{
 if(!sheets.length||sheets.length>65529||sheets.some(s=>!s.headers.length||s.headers.length>16384))throw Error('Workbook export exceeds sheet or column capacity')
 const names=new Set<string>(),labels=sheets.map(sheet=>{let label=sheet.name.replace(/[\\/?*\[\]:]/g,' ').slice(0,31)||'Table',n=2;while(names.has(label.toLowerCase()))label=sheet.name.slice(0,25)+' '+n++;names.add(label.toLowerCase());return label})
 async function* entries():AsyncGenerator<StreamEntry>{
  yield {name:'[Content_Types].xml',body:text(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`)}
  yield {name:'_rels/.rels',body:text(`<Relationships xmlns="${relationships}"><Relationship Id="rId1" Type="${officeRelationships}/officeDocument" Target="xl/workbook.xml"/></Relationships>`)}
  yield {name:'xl/workbook.xml',body:text(`<workbook xmlns="${spreadsheet}" xmlns:r="${officeRelationships}"><sheets>${labels.map((label,i)=>`<sheet name="${escapeXml(label)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`)}
  yield {name:'xl/_rels/workbook.xml.rels',body:text(`<Relationships xmlns="${relationships}">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="${officeRelationships}/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="styles" Type="${officeRelationships}/styles" Target="styles.xml"/></Relationships>`)}
  yield {name:'xl/styles.xml',body:text(`<styleSheet xmlns="${spreadsheet}"><numFmts count="${2+currencies.length}"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm:ss"/><numFmt numFmtId="165" formatCode="&quot;$&quot;#,##0.00"/>${currencies.map((code,i)=>`<numFmt numFmtId="${166+i}" formatCode="&quot;${code}&quot; #,##0.00"/>`).join('')}</numFmts><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${5+currencies.length}">${[0,14,164,165,10,...currencies.map((_,i)=>166+i)].map(id=>`<xf numFmtId="${id}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`).join('')}</cellXfs></styleSheet>`)}
  for(const [index,sheet]of sheets.entries()){
   async function* rows(){yield xml(`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${spreadsheet}"><sheetData>`);let number=1;const row=(cells:ExportCell[])=>xml(`<row r="${number}">${cells.map((value,j)=>cell(value,column(j)+number)).join('')}</row>`);yield row(sheet.headers.map(value=>({value,type:'text'})));for await(const values of sheet.rows){if(++number>1048576||values.length>16384)throw Error('Workbook exceeds Excel row or column capacity');yield row(values)}yield xml('</sheetData></worksheet>')}
   yield {name:`xl/worksheets/sheet${index+1}.xml`,body:rows()}
  }
 }
 yield* streamZip(entries())
}
