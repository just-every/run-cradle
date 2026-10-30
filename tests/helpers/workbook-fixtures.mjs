import {writeWorkbook} from '../../src/domains/records/workbooks/write.ts'
import {zipFiles} from '../../src/domains/records/base-transfer/export-zip.ts'
import {unzipWorkbook} from '../../src/domains/records/workbooks/zip.ts'
export const cell=(value,type=typeof value==='boolean'?'boolean':'text')=>({value,type})
export const workbookSheets=()=>[{name:'Orders',headers:['Order','Amount','Due','Approved','Company'],rows:[[cell('synthetic-cradle-1'),cell('12.5','number'),cell('2026-10-22','date'),cell(true),cell('North')],[cell('synthetic-cradle-2'),cell('20','number'),cell('2026-10-23T12:30:00.000Z','instant'),cell(false),cell('North')]]},{name:'Companies',headers:['Company','City'],rows:[[cell('North'),cell('Brisbane')]]}]
export const workbook=()=>writeWorkbook(workbookSheets())
/** Fixed cached results are authored independently of the importer's evaluator. */
export function arithmeticWorkbook({crossRow=false}={}){
 const sheets=[{name:'Orders',headers:['Order','Quantity','Unit price','Total','Mismatch','Mixed','External','Cycle one','Cycle two'],rows:[
  ['synthetic-cradle-formula-1','2','12.5','25','25','25','10','4','3'],
  ['synthetic-cradle-formula-2','3','7.25','21.75','21.75','10.25','10','4','3'],
  ['synthetic-cradle-formula-3','0','100','0','0','100','10','4','3'],
  ['synthetic-cradle-formula-4','-2','1.5','-3','99','-0.5','10','4','3'],
 ].map(row=>row.map((value,i)=>cell(value,i?'number':'text')))},{name:'Packages',headers:['Package','Weight','Units','Shipping'],rows:[
  [cell('synthetic-cradle-package-1'),cell('2','number'),cell('4','number'),cell('3','number')],
  [cell('synthetic-cradle-package-2'),cell('10','number'),cell('5','number'),cell('7.5','number')],
 ]}]
 const files=unzipWorkbook(writeWorkbook(sheets),'arithmetic.xlsx')
 const add=(sheet,formulas)=>{const name=`xl/worksheets/sheet${sheet}.xml`;let xml=new TextDecoder().decode(files.get(name));for(const [coordinate,expression]of formulas)xml=xml.replace(new RegExp(`(<c r="${coordinate}"[^>]*>)`),`$1<f>${expression}</f>`);files.set(name,Buffer.from(xml))}
 add(1,[2,3,4,5].flatMap(row=>[[`D${row}`,row===2&&crossRow?'B3*C2':`B${row}*C${row}`],[`E${row}`,`B${row}*C${row}`],[`F${row}`,row===2?`B${row}*C${row}`:`B${row}+C${row}`],[`G${row}`,`Packages!B${row}`],[`H${row}`,`I${row}+1`],[`I${row}`,`H${row}-1`]]))
 add(2,[["D2","(B2+C2)/2"],["D3","(B3+C3)/2"]])
 return zipFiles([...files].map(([name,bytes])=>({name,bytes})),true)
}
export function ooxmlFixture(){const files=unzipWorkbook(writeWorkbook([{name:'Typed',headers:['Key','Formula','Date','Time','Checked'],rows:[]}]),'fixture.xlsx');files.set('xl/sharedStrings.xml',Buffer.from('<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>synthetic-cradle-shared</t></si></sst>'));const source=new TextDecoder().decode(files.get('xl/worksheets/sheet1.xml')).replace('</sheetData>','<row r="2"><c r="A2" t="s"><v>0</v></c><c r="B2"><f>2+3</f><v>5</v></c><c r="C2" s="1"><v>46317</v></c><c r="D2" s="2"><v>46317.5</v></c><c r="E2" t="b"><v>1</v></c></row></sheetData>');files.set('xl/worksheets/sheet1.xml',Buffer.from(source));return zipFiles([...files].map(([name,bytes])=>({name,bytes})),true)}
export function invalidWorkbooks(){const base=workbook(),parts=unzipWorkbook(base,'fixture.xlsx'),over=new Map(parts);over.set('xl/worksheets/sheet1.xml',Buffer.from(new TextDecoder().decode(parts.get('xl/worksheets/sheet1.xml')).replace('r="2"','r="10002"')));return [{name:'encrypted.xlsx',bytes:new Uint8Array([0xd0,0xcf,0x11,0xe0]),reason:/unencrypted/i},{name:'macro.xlsm',bytes:base,reason:/macro/i},{name:'malformed.xlsx',bytes:new Uint8Array([80,75,3]),reason:/workbook|zip/i},{name:'over.xlsx',bytes:zipFiles([...over].map(([name,bytes])=>({name,bytes})),true),reason:/rows limit/}]}

/** These cached values are independent source expectations, including a deliberately wrong cache. */
export function lookupSheets({duplicate=false,partial=false,mixed=false}={}){
 const vendors=[['synthetic-cradle-v1','12.5','Brisbane'],['synthetic-cradle-v2','7.25','Perth'],[duplicate?'synthetic-cradle-v1':'synthetic-cradle-v3','0','Darwin']]
 const rows=[['synthetic-cradle-order-1','synthetic-cradle-v1','2','12.5','Brisbane','12.5','12.5','25'],['synthetic-cradle-order-2','synthetic-cradle-v2','3','7.25','Perth','99','7.25','21.75'],['synthetic-cradle-order-3','synthetic-cradle-v1','4','12.5','Brisbane','12.5','12.5','50']]
 return [{name:'Purchases',headers:['Purchase','Vendor','Quantity','V price','X city','Bad cache','Approximate','Extended'],rows:rows.map((row,i)=>row.map((value,j)=>{
  const r=i+2,formulas={3:`VLOOKUP(B${r},'Vendor catalog'!$A$2:$C$${partial?3:4},2,FALSE)`,4:`XLOOKUP(B${r},'Vendor catalog'!$A$2:$A$4,'Vendor catalog'!$C$2:$C$4)`,5:`VLOOKUP(B${r},'Vendor catalog'!$A$2:$C$4,2,FALSE)`,6:`VLOOKUP(B${r},'Vendor catalog'!$A$2:$C$4,2,TRUE)`,7:`C${r}*D${r}`},formula=j===3&&mixed&&i===2?`C${r}+1`:formulas[j]
  return {...cell(value,[2,3,5,6,7].includes(j)?'number':'text'),...(formula?{formula,coordinate:String.fromCharCode(65+j)+r}:{})}
 }))},{name:'Vendor catalog',headers:['Vendor key','Price','City'],rows:vendors.map(row=>row.map((v,i)=>cell(v,i===1?'number':'text')))}]
}
export function formulaWorkbook(sheets){
 const files=unzipWorkbook(writeWorkbook(sheets),'lookups.xlsx'),escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
 for(const [index,sheet]of sheets.entries()){
  const name=`xl/worksheets/sheet${index+1}.xml`;let xml=new TextDecoder().decode(files.get(name))
  for(const row of sheet.rows)for(const cell of row)if(cell.formula){const type=cell.type==='number'?'':' t="str"';xml=xml.replace(new RegExp(`<c r="${cell.coordinate}"[^>]*>.*?</c>`),`<c r="${cell.coordinate}"${type}><f>${escape(cell.formula)}</f><v>${escape(cell.value)}</v></c>`)}
  files.set(name,Buffer.from(xml))
 }
 return zipFiles([...files].map(([name,bytes])=>({name,bytes})),true)
}
