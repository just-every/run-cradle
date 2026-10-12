import '../scripts/typescript-loader.mjs'
import assert from 'node:assert/strict'
import { contract } from './contract.mjs'
import { prepareCsvSource,allocateImportIdentities } from '../src/domains/records/base-transfer/source.ts'
import { previewBaseImport } from '../src/domains/records/base-transfer/plan.ts'
import { parseBaseCsv,parseLinkCell } from '../src/domains/records/base-transfer/parse.ts'
import { prepareApiSource } from '../src/domains/records/base-transfer/source-api.ts'
import { numberValue,dateValue } from '../src/domains/records/base-transfer/convert.ts'
import { cellCharacters } from '../src/domains/records/base-transfer/format.ts'
const bytes=text=>new TextEncoder().encode(text)
const file=(filename,text)=>({filename,bytes:bytes(text)})
const preview=(source,options={name:'Imported'},ids=allocateImportIdentities(source))=>previewBaseImport(source,options,ids)
contract('RECORDS-005','CSV exact custody, primary identity, physical lines, inert script/formula text',()=>{
 const original=file('Objects.csv','\uFEFFIdentity,Notes\r\n001,"first\r\nsecond"\r\n002,<script>alert(1)</script>\r\n003,=1+2\r\n004,+call\r\n005,-call\r\n006,@call\r\n')
 const source=prepareCsvSource([original]);assert.deepEqual(Buffer.from(source.bundle.artifacts[0].original.base64,'base64'),Buffer.from(original.bytes))
 assert.equal(source.tables[0].rows[1].location.row,4);assert.equal(source.tables[0].rows[0].values['column-2'],'first\r\nsecond')
 const result=preview(source);assert.equal(result.schemaDraft.tables[0].primaryFieldId,result.identities.tables['Objects.csv'].fields['column-1'])
 assert.deepEqual(result.records.map(r=>r.fields[result.identities.tables['Objects.csv'].fields['column-2']]),['first\r\nsecond','<script>alert(1)</script>','=1+2','+call','-call','@call'])
})
contract('RECORDS-005','parser fails loudly for invalid UTF8, quotes, headers, ragged rows with file line',()=>{
 for(const [text,message] of [['A,A\n1,2','Duplicate header'],['A,\n1,2','Empty header'],['A,B\n"a\nb",c\nq','LINE 4'],['A\n"open','Unterminated quote']])assert.throws(()=>parseBaseCsv(bytes(text),'test.csv'),new RegExp(message))
 assert.throws(()=>parseBaseCsv(new Uint8Array([0xff]),'bad.csv'),/bad.csv LINE 1: Invalid UTF-8/)
})
contract('RECORDS-005','all row failures and named conversions are accounted; dates require preview choice',()=>{
 const source=prepareCsvSource([file('Rows.csv','ID,Price,Date\n1,"$1,200.00",2/3/2026\n2,garbage,2026-02-30\n3,50%,2026-03-01')]),ids=allocateImportIdentities(source)
 const options={name:'Numbers',tables:{'Rows.csv':{columns:{'column-2':{type:'number'},'column-3':{type:'date'}}}}}
 const first=preview(source,options,ids);assert.equal(first.report.tables[0].created,1);assert.equal(first.report.tables[0].rejected,2);assert.equal(first.report.diagnostics.filter(d=>d.code==='CELL_CONVERSION').length,3)
 const revised=preview(source,{...options,tables:{'Rows.csv':{columns:{...options.tables['Rows.csv'].columns,'column-3':{type:'date',dateConvention:'day-first'}}}}},ids)
 assert.equal(revised.report.tables[0].created,2);assert.notEqual(revised.fingerprint,first.fingerprint);assert.deepEqual(revised.identities,first.identities)
 assert.equal(numberValue('9007199254740993'),'9007199254740993');assert.equal(numberValue('50%'),'0.5');assert.equal(numberValue(' $1,200.00 '),'1200');assert.throws(()=>numberValue('1,20'),/groups/);assert.throws(()=>numberValue('NaN'))
 assert.throws(()=>dateValue('2/3/2026'),/never guessed/)
})
contract('RECORDS-005','link reference grammar preserves exact identities and every resolution state',()=>{
 assert.deepEqual(parseLinkCell('"name, comma","quote ""inside""", space '),['name, comma','quote "inside"',' space ']);assert.deepEqual(parseLinkCell(''),[])
 const source=prepareCsvSource([file('Targets.csv','ID,Score\nexact,1\nduplicate,2\nduplicate,3\nbad,broken\n exact,4'),file('Links.csv','ID,Link\nsource,"exact,duplicate,missing,bad, exact"')])
 const options={name:'Links',tables:{'Targets.csv':{columns:{'column-2':{type:'number'}}},'Links.csv':{columns:{'column-2':{type:'relation',relationTableKey:'Targets.csv'}}}}}
 const result=preview(source,options),account=result.report.tables[1].links[0]
 assert.equal(account.referencesRead,5);assert.equal(account.resolved,3);assert.equal(account.ambiguous,1);assert.equal(account.unresolved,1)
 assert.equal(result.links[0].targetRecordIds.length,2);assert.ok(result.report.diagnostics.some(d=>d.code==='TARGET_ROW_REJECTED'))
 assert.equal(result.links[0].cardinality,'many');assert.equal(account.listings[1].candidates.length,2);assert.equal(account.listings[3].materializable,false)
})
contract('RECORDS-005','select defaults follow first-seen rows and explicit unused choices keep stable identities',()=>{
 const source=prepareCsvSource([file('People.csv','Name,Role\nA,Staff\nB,Owner\nC,Staff')]);source.tables[0].columns[1].options=['Unused']
 const ids=allocateImportIdentities(source),options={name:'People',tables:{'People.csv':{columns:{'column-2':{type:'select'}}}}},a=preview(source,options,ids)
 assert.deepEqual(a.schemaDraft.tables[0].fields[1].options.map(o=>o.label),['Staff','Owner'])
 const revised={name:'People',tables:{'People.csv':{columns:{'column-2':{type:'select',options:['Staff','Owner','Unused','New']}}}}}
 assert.deepEqual(preview(source,revised,ids).schemaDraft.tables[0].fields[1].options.map(o=>o.label),['Staff','Owner','Unused','New'])
 assert.equal(preview(source,revised,ids).fingerprint,preview(source,revised,ids).fingerprint)
 assert.notEqual(a.fingerprint,preview(source,revised,ids).fingerprint)
})
contract('RECORDS-005','CSV and API selects default to first-seen nonempty values and preserve explicit ordered overrides',async()=>{
 const csv=prepareCsvSource([file('Choices.csv','ID,Choice\none,Beta\ntwo,Alpha\nthree,Beta\nfour,')]);csv.tables[0].columns[1].options=['Unused','Alpha','Beta']
 const csvDefault=preview(csv,{name:'CSV',tables:{'Choices.csv':{columns:{'column-2':{type:'select'}}}}})
 assert.deepEqual(csvDefault.schemaDraft.tables[0].fields[1].options.map(o=>o.label),['Beta','Alpha'])
 assert.equal(csvDefault.records[3].fields[csvDefault.identities.tables['Choices.csv'].fields['column-2']],null)
 assert.deepEqual(csvDefault.columnPreviews['Choices.csv'][1].sourceOptions,['Unused','Alpha','Beta'])
 assert.deepEqual(csvDefault.columnPreviews['Choices.csv'][1].unusedSourceOptions,['Unused'])
 const explicit=['Unused','Beta','Alpha'],csvOverride=preview(csv,{name:'CSV',tables:{'Choices.csv':{columns:{'column-2':{type:'select',options:explicit}}}}})
 assert.deepEqual(csvOverride.schemaDraft.tables[0].fields[1].options.map(o=>o.label),explicit)

 // Exercise the API PreparedSource shape at the preview boundary, independent of API transport.
 const api=prepareCsvSource([file('Choices.csv','ID,Choice\none,Beta\ntwo,Alpha\nthree,Beta\nfour,')]);api.format='api';api.tables[0].columns[1].sourceType='singleSelect';api.tables[0].columns[1].options=['Unused','Alpha','Beta'];api.tables[0].rows[3].values['column-2']=null
 const apiDefault=preview(api)
 assert.equal(apiDefault.schemaDraft.tables[0].fields[1].type,'select')
 assert.deepEqual(apiDefault.schemaDraft.tables[0].fields[1].options.map(o=>o.label),['Beta','Alpha'])
 assert.equal(apiDefault.records[3].fields[apiDefault.identities.tables['Choices.csv'].fields['column-2']],null)
 assert.deepEqual(apiDefault.columnPreviews['Choices.csv'][1].sourceOptions,['Unused','Alpha','Beta'])
 assert.deepEqual(apiDefault.columnPreviews['Choices.csv'][1].unusedSourceOptions,['Unused'])
 const apiOverride=preview(api,{name:'API',tables:{'Choices.csv':{columns:{'column-2':{type:'select',options:explicit}}}}})
 assert.deepEqual(apiOverride.schemaDraft.tables[0].fields[1].options.map(o=>o.label),explicit)
})
contract('RECORDS-005','lookup requires every exported value to match a true one link',()=>{
 const source=prepareCsvSource([file('Teams.csv','Name,City\nNorth,Brisbane\nSouth,Sydney'),file('People.csv','Name,Team,City\nA,North,Brisbane\nB,South,WRONG')])
 source.tables[1].columns[1].relationTableKey='Teams.csv';source.tables[1].columns[2].lookup={relationColumnKey:'column-2',valueColumnKey:'column-2'}
 const ids=allocateImportIdentities(source),first=preview(source,{name:'Lookups'},ids)
 assert.equal(first.report.lookups[0].recognized,false);assert.equal(first.report.lookups[0].firstMismatch.rowKey,'row-2');assert.match(first.report.lookups[0].firstMismatch.message,/WRONG.*Sydney/)
 const clean=prepareCsvSource([file('Teams.csv','Name,City\nNorth,Brisbane\nSouth,Sydney'),file('People.csv','Name,Team,City\nA,North,Brisbane\nB,South,Sydney')]);clean.tables[1].columns[1].relationTableKey='Teams.csv';clean.tables[1].columns[2].lookup={relationColumnKey:'column-2',valueColumnKey:'column-2'}
 const accepted=preview(clean);assert.equal(accepted.report.lookups[0].recognized,true);assert.equal(accepted.schemaDraft.tables[1].fields[2].type,'computed');assert.equal(accepted.records[2].fields[accepted.schemaDraft.tables[1].fields[2].id],undefined)
})
contract('RECORDS-005','bounds accept exact capacity and refuse plus one without writes',()=>{
 const cell='x'.repeat(100000);assert.equal(cellCharacters(cell),100000);assert.equal(parseBaseCsv(bytes('Name\n'+cell),'capacity.csv').rows[0].cells[0],cell)
 assert.throws(()=>parseBaseCsv(bytes('Name\n'+cell+'x'),'capacity.csv'),/LIMIT cellCharacters value 100000 CURRENT 100001/)
 const rows='ID\n'+Array.from({length:10000},(_,i)=>i).join('\n');assert.equal(parseBaseCsv(bytes(rows),'rows.csv').rows.length,10000);assert.throws(()=>parseBaseCsv(bytes(rows+'\nextra'),'rows.csv'),/LIMIT csvImportRows value 10000 CURRENT 10001/)
 const fields=Array.from({length:80},(_,i)=>'Field'+i).join(',');assert.equal(parseBaseCsv(bytes(fields),'fields.csv').headers.length,80);assert.throws(()=>parseBaseCsv(bytes(fields+',extra'),'fields.csv'),/LIMIT fields value 80 CURRENT 81/)
 const tables=Array.from({length:20},(_,i)=>file(i+'.csv','ID\nA'));assert.equal(prepareCsvSource(tables).tables.length,20);assert.throws(()=>prepareCsvSource([...tables,file('extra.csv','ID\nA')]),/LIMIT tables value 20 CURRENT 21/)
 const prefix='ID\n'+('x'.repeat(100000)+'\n').repeat(104),exact=bytes(prefix+'x'.repeat(10*1024*1024-prefix.length));assert.equal(parseBaseCsv(exact,'bytes.csv').rows.length,105);assert.throws(()=>parseBaseCsv(new Uint8Array(exact.length+1),'bytes.csv'),/LIMIT csvImportBytes value 10485760 CURRENT 10485761/)
})
contract('BASE-INPUT-001','source-like headers and primary whitespace cannot modify object prototypes',()=>{
 const source=prepareCsvSource([file('Safe.csv','__proto__,constructor\n exact,prototype\nexact,normal')]);const result=preview(source);assert.equal(result.records.length,2);assert.equal(result.records[0].fields[result.schemaDraft.tables[0].fields[0].id],' exact');assert.equal({}.polluted,undefined)
})
contract('RECORDS-005','API declared metadata and paginated original bytes preserve every source record',async()=>{
 const metadata=bytes('{"tables":[{"id":"tblPeople","name":"People","fields":[{"id":"fldName","name":"Name","type":"singleLineText"},{"id":"fldPercent","name":"Percent","type":"percent"},{"id":"fldDone","name":"Done","type":"checkbox"}]}]}\n')
 const pages=[bytes('{"records":[{"id":"recA","fields":{"Name":"A","Percent":0.5,"Done":true}},{"id":"recB","fields":{"Name":"B","Percent":0.25}}],"offset":"page-two"}'),bytes('{"records":[]}')],requests=[]
 const source=await prepareApiSource({metadataUrl:'https://example.com/metadata',recordsUrl:()=> 'https://example.com/records'},async request=>{requests.push(request);return new Response(request.url.endsWith('/metadata')?metadata:request.url.includes('offset=')?pages[1]:pages[0])})
 assert.equal(requests.length,3);assert.equal(source.bundle.records.length,3);assert.deepEqual(Buffer.from(source.bundle.artifacts[0].original.base64,'base64'),Buffer.from(metadata))
 assert.deepEqual(Buffer.from(source.bundle.artifacts[1].original.base64,'base64'),Buffer.from(pages[0]));assert.deepEqual(Buffer.from(source.bundle.artifacts[2].original.base64,'base64'),Buffer.from(pages[1]))
 const result=preview(source);assert.equal(result.records.length,2);assert.equal(result.records[1].fields[result.schemaDraft.tables[0].fields[2].id],false);assert.equal(result.records[0].fields[result.schemaDraft.tables[0].fields[1].id],'0.5')
})
contract('RECORDS-005','CSV evidence proposes links, exposes multi-table ambiguity, and recomputes overrides',()=>{
 const source=prepareCsvSource([file('Teams.csv','ID,City\nNorth,Brisbane\nSouth,Sydney'),file('People.csv','Name,Team,City\nAlice,North,Brisbane\nBob,South,Sydney')]),ids=allocateImportIdentities(source),first=preview(source,{name:'Evidence'},ids)
 assert.equal(first.schemaDraft.tables[1].fields[1].type,'relation');assert.equal(first.schemaDraft.tables[1].fields[2].type,'computed');assert.ok(first.report.diagnostics.some(d=>d.code==='LINK_INFERRED'))
 const overridden=preview(source,{name:'Evidence',tables:{'People.csv':{columns:{'column-2':{type:'text'},'column-3':{type:'text'}}}}},ids)
 assert.equal(overridden.links.length,0);assert.equal(overridden.schemaDraft.tables[1].fields[2].type,'text');assert.notEqual(first.fingerprint,overridden.fingerprint)
 const ambiguous=prepareCsvSource([file('First.csv','ID\nNorth\nSouth'),file('Second.csv','ID\nNorth\nSouth'),file('People.csv','Name,Team\nAlice,North\nBob,South')]),result=preview(ambiguous)
 assert.equal(result.schemaDraft.tables[2].fields[1].type,'text');assert.ok(result.report.diagnostics.some(d=>d.code==='LINK_TARGET_AMBIGUOUS'))
 const selected=preview(ambiguous,{name:'Choice',tables:{'People.csv':{columns:{'column-2':{type:'relation',relationTableKey:'Second.csv'}}}}})
 assert.equal(selected.links.length,2)
})
contract('RECORDS-005','reciprocal exports become one physical relation with preserved incoming descriptor',()=>{
 const source=prepareCsvSource([file('Teams.csv','ID,Members\nNorth,"Alice,Bob"\nSouth,Cara'),file('People.csv','ID,Team\nAlice,North\nBob,North\nCara,South')]),result=preview(source)
 assert.equal(result.schemaDraft.tables[0].fields.length,1);assert.equal(result.schemaDraft.tables[1].fields[1].relation.cardinality,'one');assert.equal(result.schemaDraft.tables[0].incomingRelations[0].label,'Members');assert.equal(result.report.reciprocalRelations.length,1)
 assert.equal(result.links.length,3);assert.equal(result.inverseViews[0].canonicalTableKey,'People.csv')
 const disagree=prepareCsvSource([file('Teams.csv','ID,Members\nNorth,"Alice,Bob"\nSouth,Cara'),file('People.csv','ID,Team\nAlice,North\nBob,South\nCara,South')]),disagreeResult=preview(disagree)
 assert.equal(disagreeResult.report.reciprocalRelations.length,1);assert.equal(disagreeResult.schemaDraft.tables[0].fields.length,1);assert.equal(disagreeResult.acknowledgments.loss,true);assert.ok(disagreeResult.report.diagnostics.some(d=>d.code==='RECIPROCAL_DISAGREEMENT'))
 const tie=prepareCsvSource([file('First.csv','ID,Second\nA,B'),file('Second.csv','ID,First\nB,A')]),tied=preview(tie)
 assert.equal(tied.inverseViews[0].canonicalTableKey,'First.csv');assert.match(tied.inverseViews[0].description,/both ONE/)
})
contract('RECORDS-005','self links, missing target, malformed/cardinality failures and skip are fully reported',()=>{
 const source=prepareCsvSource([file('Nodes.csv','ID,Parent,Attachment\nA,A,file\nB,Missing,\nC,"A,B",second')]),ids=allocateImportIdentities(source)
 const result=preview(source,{name:'Self',tables:{'Nodes.csv':{columns:{'column-2':{type:'relation',relationTableKey:'Nodes.csv',cardinality:'one'},'column-3':{skip:true}}}}},ids)
 assert.equal(result.records.length,2);assert.equal(result.report.tables[0].rejected,1);assert.equal(result.report.tables[0].columns[1].unparseable,1);assert.equal(result.report.tables[0].columns[2].skippedNonempty,2)
 assert.equal(result.links[0].targetRecordIds[0],ids.tables['Nodes.csv'].records['row-1']);assert.equal(result.report.tables[0].links[0].referencesRead,4);assert.equal(result.report.tables[0].links[0].unresolved,1);assert.equal(result.acknowledgments.loss,true)
 const noTarget=preview(source,{name:'Unmapped',tables:{'Nodes.csv':{columns:{'column-2':{type:'relation',relationTableKey:'absent'}}}}},ids)
 assert.equal(noTarget.schemaDraft.tables[0].fields[1].type,'text');assert.ok(noTarget.report.diagnostics.some(d=>d.code==='LINK_TARGET_REQUIRED'));assert.equal(noTarget.report.tables[0].links[0].unresolved,4)
})
contract('RECORDS-005','astral code-point boundary and bad UTF8 report actual physical line',()=>{
 const value='😀'.repeat(100000);assert.equal(cellCharacters(value),100000);assert.equal(parseBaseCsv(bytes('Name\n'+value),'unicode.csv').rows[0].cells[0],value)
 assert.throws(()=>parseBaseCsv(bytes('Name\n'+value+'😀'),'unicode.csv'),/LIMIT cellCharacters value 100000 CURRENT 100001/)
 const prefix=bytes('ID\r\nvalid\r\n'),bad=new Uint8Array(prefix.length+1);bad.set(prefix);bad[prefix.length]=0xff;assert.throws(()=>parseBaseCsv(bad,'utf.csv'),/utf.csv LINE 3: Invalid UTF-8/)
})
contract('RECORDS-005','API declared primary order, explicit option order and unsupported fields survive preview accounting',async()=>{
 const metadata=bytes(JSON.stringify({tables:[{id:'t',name:'T',primaryFieldId:'id',fields:[{id:'role',name:'Role',type:'singleSelect',options:{choices:[{name:'Unused'},{name:'Staff'},{name:'Owner'}]}},{id:'id',name:'ID',type:'number'},{id:'labels',name:'Labels',type:'multipleSelects',options:{choices:[{name:'First'},{name:'Second'},{name:'Legacy'}]}}]}]})),records=bytes(JSON.stringify({records:[{id:'r',fields:{ID:9007199254740991,Role:'Owner',Labels:['Second','First'],Unknown:'retain'}}]}))
 const source=await prepareApiSource({metadataUrl:'https://example.com/meta',recordsUrl:()=> 'https://example.com/rows'},async request=>new Response(request.url.endsWith('meta')?metadata:records)),result=preview(source,{name:'Imported',tables:{t:{columns:{role:{type:'select',options:['Unused','Staff','Owner']}}}}})
 assert.equal(result.schemaDraft.tables[0].primaryFieldId,result.identities.tables.t.fields.id);assert.equal(result.source.tables[0].columns[0].key,'role')
 assert.deepEqual(result.schemaDraft.tables[0].fields[0].options.map(o=>o.label),['Unused','Staff','Owner']);assert.equal(result.records[0].fields[result.identities.tables.t.fields.labels],'Second, First')
 assert.deepEqual(result.columnPreviews.t[2].sourceOptions,['First','Second','Legacy']);assert.deepEqual(result.columnPreviews.t[2].unusedSourceOptions,['Legacy']);assert.equal(result.columnPreviews.t[2].converted,1)
 assert.ok(result.report.diagnostics.some(d=>d.code==='UNSUPPORTED_SOURCE_FIELD'&&d.raw==='retain'));assert.equal(result.acknowledgments.loss,true)
 assert.equal(source.bundle.records[1].payload.fields.Unknown,'retain')
})
contract('RECORDS-005','skipped missing-target links still account every source reference',()=>{
 const source=prepareCsvSource([file('Links.csv','ID,External\nA,missing\nB,"missing,other"')]),result=preview(source,{name:'Skipped',tables:{'Links.csv':{columns:{'column-2':{type:'relation',skip:true,relationTableKey:'missing-table'}}}}})
 assert.equal(result.schemaDraft.tables[0].fields.length,1);assert.equal(result.links.length,0);assert.equal(result.report.tables[0].links[0].referencesRead,3);assert.equal(result.report.tables[0].links[0].unresolved,3);assert.equal(result.report.tables[0].columns[1].skippedNonempty,2)
 assert.equal(result.report.tables[0].links[0].listings[2].reference,'other')
})
contract('RECORDS-005','explicit reciprocal pairing preserves one canonical relation even with total disagreement',()=>{
 const source=prepareCsvSource([file('First.csv','ID,Second\nA,X\nB,Y'),file('Second.csv','ID,First\nX,B\nY,A')]),ids=allocateImportIdentities(source)
 const result=preview(source,{name:'Explicit',tables:{'First.csv':{columns:{'column-2':{type:'relation',relationTableKey:'Second.csv',reciprocal:{tableKey:'Second.csv',columnKey:'column-2'}}}},'Second.csv':{columns:{'column-2':{type:'relation',relationTableKey:'First.csv'}}}}},ids)
 assert.equal(result.report.reciprocalRelations.length,1);assert.equal(result.schemaDraft.tables[0].fields[1].type,'relation');assert.equal(result.schemaDraft.tables[1].fields.length,1);assert.equal(result.links.length,2)
 assert.equal(result.report.diagnostics.filter(d=>d.code==='RECIPROCAL_DISAGREEMENT').length,4);assert.equal(result.acknowledgments.loss,true);assert.match(result.inverseViews[0].description,/Explicit reciprocal pair/)
 assert.throws(()=>preview(source,{name:'Bad pair',tables:{'First.csv':{columns:{'column-2':{type:'relation',relationTableKey:'Second.csv',reciprocal:{tableKey:'missing',columnKey:'missing'}}}}}},ids),/explicit reciprocal pair/)
})
contract('RECORDS-005','valid type choices inspect all rows and include reasons for every normalization',()=>{
 const source=prepareCsvSource([file('Choices.csv','Name,Value,Slash\nA,1,2/3/2026\nB,2,3/4/2026\nC,3,4/5/2026\nD,4,5/6/2026\nE,5,6/7/2026\nF,bad,7/8/2026')]),result=preview(source,{name:'Choices'})
 assert.equal(result.columnPreviews['Choices.csv'][1].validTypes.includes('number'),false);assert.ok(result.columnPreviews['Choices.csv'][1].validTypes.includes('text'))
 assert.ok(result.columnPreviews['Choices.csv'][2].validTypes.includes('date'));assert.ok(result.columnPreviews['Choices.csv'][2].reasons.some(r=>r.includes('explicit day-first')))
 const mismatch=prepareCsvSource([file('Target.csv','ID,City\nA,Brisbane'),file('Source.csv','ID,Link,City\nB,A,WRONG')]);mismatch.tables[1].columns[1].relationTableKey='Target.csv';mismatch.tables[1].columns[2].lookup={relationColumnKey:'column-2',valueColumnKey:'column-2'}
 const badLookup=preview(mismatch);assert.equal(badLookup.columnPreviews['Source.csv'][2].validTypes.includes('computed'),false);assert.ok(badLookup.columnPreviews['Source.csv'][2].reasons.some(r=>r.includes('first mismatch')))
})
contract('RECORDS-005','API invalid metadata, pagination and unsafe numeric inputs fail without invented values',async()=>{
 const prepare=async(metadata,rows)=>prepareApiSource({metadataUrl:'https://example.com/meta',recordsUrl:()=> 'https://example.com/rows'},async request=>new Response(JSON.stringify(request.url.endsWith('meta')?metadata:rows)))
 await assert.rejects(()=>prepare({tables:[]},{records:[]}),/at least one table/)
 const metadata={tables:[{id:'t',name:'T',fields:[{id:'n',name:'Number',type:'number'}]}]}
 await assert.rejects(()=>prepare(metadata,{records:[],offset:42}),/Invalid pagination offset/)
 const source=await prepare(metadata,{records:[{id:'unsafe',fields:{Number:9007199254740992}},{id:'small',fields:{Number:1e-7}}]}),result=preview(source)
 assert.equal(result.records.length,1);assert.equal(result.report.tables[0].rejected,1);assert.match(result.report.diagnostics.find(d=>d.code==='CELL_CONVERSION').message,/Unsafe API integer/);assert.equal(result.records[0].fields[result.schemaDraft.tables[0].fields[0].id],'0.0000001')
})
contract('RECORDS-005','API limits name ceiling and current count before any native preview effects',async()=>{
 const fields=Array.from({length:81},(_,i)=>({id:'f'+i,name:'Field '+i,type:'singleLineText'})),metadata={tables:[{id:'t',name:'T',fields}]}
 await assert.rejects(()=>prepareApiSource({metadataUrl:'https://example.com/meta',recordsUrl:()=> 'https://example.com/rows'},async()=>new Response(JSON.stringify(metadata))),/LIMIT fields value 80 CURRENT 81/)
 const valid={tables:[{id:'t',name:'T',fields:[{id:'id',name:'ID',type:'singleLineText'}]}]},rows=Array.from({length:10001},(_,i)=>({id:'r'+i,fields:{ID:'value'}}))
 await assert.rejects(()=>prepareApiSource({metadataUrl:'https://example.com/meta',recordsUrl:()=> 'https://example.com/rows'},async request=>new Response(JSON.stringify(request.url.endsWith('meta')?valid:{records:rows}))),/LIMIT csvImportRows value 10000 CURRENT 10001/)
})
contract('BASE-INPUT-001','prototype-looking table/field/select identities remain own source data',async()=>{
 const csv=prepareCsvSource([file('__proto__','ID,Choice\nA,__proto__\nB,constructor')]),csvResult=preview(csv,{name:'Safe keys',tables:JSON.parse('{"__proto__":{"columns":{"column-2":{"type":"select"}}}}')})
 assert.equal(csvResult.schemaDraft.tables.length,1);assert.equal(csvResult.schemaDraft.tables[0].fields[1].options[0].label,'__proto__');assert.ok(Object.hasOwn(csvResult.identities.tables,'__proto__'));assert.ok(Object.hasOwn(csvResult.columnPreviews,'__proto__'))
 const metadata={tables:[{id:'__proto__',name:'Safe',fields:[{id:'__proto__',name:'ID',type:'singleLineText'}]}]},records={records:[{id:'constructor',fields:JSON.parse('{"__proto__":"exact"}')} ]}
 const source=await prepareApiSource({metadataUrl:'https://example.com/meta',recordsUrl:()=> 'https://example.com/rows'},async request=>new Response(JSON.stringify(request.url.endsWith('meta')?metadata:records))),result=preview(source)
 assert.equal(result.records[0].fields[result.schemaDraft.tables[0].fields[0].id],'exact');assert.ok(Object.hasOwn(source.tables[0].rows[0].values,'__proto__'));assert.equal({}.polluted,undefined)
})
contract('RECORDS-005','skipping the actual relation disables lookup even if exported values still match',()=>{
 const source=prepareCsvSource([file('Teams.csv','Name,City\nNorth,Brisbane'),file('People.csv','Name,Team,City\nA,North,Brisbane')]);source.tables[1].columns[1].relationTableKey='Teams.csv';source.tables[1].columns[2].lookup={relationColumnKey:'column-2',valueColumnKey:'column-2'}
 const result=preview(source,{name:'Skipped link',tables:{'People.csv':{columns:{'column-2':{skip:true}}}}})
 assert.equal(result.report.lookups[0].recognized,false);assert.equal(result.schemaDraft.tables[1].fields[1].type,'text');assert.equal(result.columnPreviews['People.csv'][2].validTypes.includes('computed'),false)
})
contract('RECORDS-005','a lookup cannot silently use another computed lookup as native stored scalar',()=>{
 const source=prepareCsvSource([file('Root.csv','ID,Value\nR,scalar'),file('Middle.csv','ID,Root,Value\nM,R,scalar'),file('Last.csv','ID,Middle,Value\nL,M,scalar')]);source.tables[1].columns[1].relationTableKey='Root.csv';source.tables[1].columns[2].lookup={relationColumnKey:'column-2',valueColumnKey:'column-2'};source.tables[2].columns[1].relationTableKey='Middle.csv';source.tables[2].columns[2].lookup={relationColumnKey:'column-2',valueColumnKey:'column-3'}
 const result=preview(source);assert.equal(result.report.lookups.find(l=>l.tableKey==='Middle.csv').recognized,true);assert.equal(result.report.lookups.find(l=>l.tableKey==='Last.csv').recognized,false);assert.equal(result.schemaDraft.tables[2].fields[2].type,'text')
})
contract('RECORDS-005','inverse label overrides recompute incoming schema and fingerprint with stable native IDs',()=>{
 const source=prepareCsvSource([file('Teams.csv','ID,Members\nNorth,"Alice,Bob"'),file('People.csv','ID,Team\nAlice,North\nBob,North')]),ids=allocateImportIdentities(source),first=preview(source,{name:'Labels'},ids),second=preview(source,{name:'Labels',tables:{'Teams.csv':{label:'Groups',columns:{'column-2':{label:'Colleagues'}}},'People.csv':{label:'Staff',columns:{'column-2':{label:'Group'}}}}},ids)
 assert.equal(second.schemaDraft.tables[0].incomingRelations[0].label,'Colleagues');assert.match(second.inverseViews[0].description,/Staff.Group/);assert.notEqual(second.fingerprint,first.fingerprint);assert.deepEqual(second.identities,first.identities)
})
contract('BASE-INPUT-001','omitted API field with prototype-looking name stays omitted raw data',async()=>{
 const source=await prepareApiSource({metadataUrl:'https://example.com/meta',recordsUrl:()=> 'https://example.com/rows'},async request=>new Response(JSON.stringify(request.url.endsWith('meta')?{tables:[{id:'t',name:'T',fields:[{id:'id',name:'constructor',type:'singleLineText'}]}]}:{records:[{id:'r',fields:{}}]}))),result=preview(source)
 assert.equal(Object.hasOwn(source.tables[0].rows[0].values,'id'),false);assert.equal(result.records[0].fields[result.schemaDraft.tables[0].fields[0].id],'');assert.equal(result.report.tables[0].columns[0].nonempty,0)
})

contract('RECORDS-005','explicit lookup mapping restores arbitrary labels without mutating source or native identities',()=>{
 const source=prepareCsvSource([file('Target.csv','ID,City\nA,Brisbane\nB,Sydney'),file('Source.csv','ID,Target,Arbitrary caption\nX,A,Brisbane\nY,B,Sydney')]),ids=allocateImportIdentities(source)
 const options={name:'Mapped',tables:{'Source.csv':{columns:{'column-2':{type:'relation',relationTableKey:'Target.csv'},'column-3':{lookup:{relationColumnKey:'column-2',valueColumnKey:'column-2'}}}}}}
 const result=preview(source,options,ids),lookup=result.report.lookups.find(l=>l.tableKey==='Source.csv'&&l.columnKey==='column-3')
 assert.equal(lookup.recognized,true);assert.equal(lookup.relationColumnKey,'column-2');assert.equal(lookup.valueColumnKey,'column-2');assert.equal(lookup.targetTableKey,'Target.csv')
 assert.equal(result.schemaDraft.tables[1].fields[2].type,'computed');assert.equal(result.columnPreviews['Source.csv'][2].lookupCandidates.find(c=>c.valueColumnKey==='column-2').matchedRows,2)
 const listing=result.report.tables[1].links[0].listings[0];assert.equal(listing.sourcePrimaryColumnKey,'column-1');assert.equal(listing.targetTableKey,'Target.csv');assert.equal(listing.targetPrimaryColumnKey,'column-1')
 assert.equal(source.tables[1].columns[2].lookup,undefined);assert.equal(JSON.stringify(result.identities),JSON.stringify(ids))
 const kept=preview(source,{...options,tables:{'Source.csv':{columns:{...options.tables['Source.csv'].columns,'column-3':{type:'text',lookup:{relationColumnKey:'column-2',valueColumnKey:'column-2'}}}}}},ids)
 assert.equal(kept.schemaDraft.tables[1].fields[2].type,'text');assert.notEqual(result.fingerprint,kept.fingerprint)
})
contract('RECORDS-005','explicit lookup proof checks a late mismatch and recomputes after relation retargeting',()=>{
 const source=prepareCsvSource([file('Target.csv','ID,Value\nA,good'),file('Other.csv','ID,Value\nA,other'),file('Source.csv','ID,Link,Display\nR1,A,good\nR2,A,good\nR3,A,good\nR4,A,good\nR5,A,good\nR6,A,bad\nR7,A,good')]),ids=allocateImportIdentities(source)
 const options={name:'Proof',tables:{'Source.csv':{columns:{'column-2':{type:'relation',relationTableKey:'Target.csv'},'column-3':{lookup:{relationColumnKey:'column-2',valueColumnKey:'column-2'}}}}}}
 const result=preview(source,options,ids),lookup=result.report.lookups.find(l=>l.tableKey==='Source.csv'&&l.columnKey==='column-3'),candidate=lookup.candidates.find(c=>c.valueColumnKey==='column-2')
 assert.equal(lookup.recognized,false);assert.equal(lookup.firstMismatch.location.row,7);assert.equal(lookup.firstMismatch.raw,'bad');assert.match(lookup.firstMismatch.message,/derived "good"/)
 assert.equal(candidate.rowsRead,7);assert.equal(candidate.matchedRows,6);assert.equal(candidate.matchesAllRows,false);assert.equal(result.schemaDraft.tables[2].fields[2].type,'text');assert.equal(result.columnPreviews['Source.csv'][2].validTypes.includes('computed'),false)
 const retarget=preview(source,{...options,tables:{'Source.csv':{columns:{...options.tables['Source.csv'].columns,'column-2':{type:'relation',relationTableKey:'Other.csv'}}}}},ids),changed=retarget.report.lookups.find(l=>l.tableKey==='Source.csv'&&l.columnKey==='column-3')
 assert.equal(changed.recognized,false);assert.equal(changed.targetTableKey,'Other.csv');assert.equal(changed.firstMismatch.location.row,2);assert.equal(changed.candidates.find(c=>c.valueColumnKey==='column-2').matchedRows,0);assert.notEqual(retarget.fingerprint,result.fingerprint)
})
contract('RECORDS-005','equal lookup candidates require owner coordinates even when one label matches',()=>{
 const source=prepareCsvSource([file('Target.csv','ID,Display,Other\nA,same,same\nB,different,different'),file('Source.csv','ID,Target,Display\nX,A,same\nY,B,different')]),ids=allocateImportIdentities(source),options={name:'Candidates',tables:{'Source.csv':{columns:{'column-2':{type:'relation',relationTableKey:'Target.csv'}}}}}
 const result=preview(source,options,ids),lookup=result.report.lookups.find(l=>l.tableKey==='Source.csv'&&l.columnKey==='column-3')
 assert.equal(lookup.recognized,false);assert.equal(result.schemaDraft.tables[1].fields[2].type,'text');assert.equal(lookup.candidates.filter(c=>c.matchesAllRows).length,2);assert.equal(lookup.ambiguity.code,'LOOKUP_CANDIDATE_AMBIGUOUS');assert.equal(result.acknowledgments.ambiguous,true);assert.ok(result.columnPreviews['Source.csv'][2].validTypes.includes('computed'))
 const selected=preview(source,{...options,tables:{'Source.csv':{columns:{...options.tables['Source.csv'].columns,'column-3':{lookup:{relationColumnKey:'column-2',valueColumnKey:'column-3'}}}}}},ids),selectedLookup=selected.report.lookups.find(l=>l.tableKey==='Source.csv'&&l.columnKey==='column-3')
 assert.equal(selectedLookup.recognized,true);assert.equal(selectedLookup.valueColumnKey,'column-3');assert.equal(selectedLookup.ambiguity,undefined);assert.equal(selected.schemaDraft.tables[1].fields[2].expression.valueFieldId,ids.tables['Target.csv'].fields['column-3'])
 const empty=prepareCsvSource([file('Target.csv','ID,Value\nA,value'),file('Source.csv','ID,Target,Display')]),noEvidence=preview(empty,{name:'Empty',tables:{'Source.csv':{columns:{'column-2':{type:'relation',relationTableKey:'Target.csv'}}}}})
 assert.equal(noEvidence.schemaDraft.tables[1].fields[2].type,'text');assert.equal(noEvidence.report.lookups.some(l=>l.recognized),false)
})

contract('RECORDS-005','explicit lookup cannot depend on another requested computed field regardless of table order',()=>{
 const source=prepareCsvSource([file('Last.csv','ID,Middle,Display\nL,M,scalar'),file('Middle.csv','ID,Root,Display\nM,R,scalar'),file('Root.csv','ID,Value\nR,scalar')]),options={name:'Dependencies',tables:{'Last.csv':{columns:{'column-2':{type:'relation',relationTableKey:'Middle.csv'},'column-3':{lookup:{relationColumnKey:'column-2',valueColumnKey:'column-3'}}}},'Middle.csv':{columns:{'column-2':{type:'relation',relationTableKey:'Root.csv'},'column-3':{lookup:{relationColumnKey:'column-2',valueColumnKey:'column-2'}}}}}}
 const result=preview(source,options),last=result.report.lookups.find(l=>l.tableKey==='Last.csv'&&l.columnKey==='column-3'),middle=result.report.lookups.find(l=>l.tableKey==='Middle.csv'&&l.columnKey==='column-3')
 assert.equal(last.recognized,false);assert.match(last.firstMismatch.message,/stored scalar target/);assert.equal(middle.recognized,true);assert.equal(result.schemaDraft.tables[0].fields[2].type,'text');assert.equal(result.schemaDraft.tables[1].fields[2].type,'computed')
})

contract('RECORDS-005','selecting relation before target preserves raw text and finite JSON through mapping and skip',()=>{
 const source=prepareCsvSource([file('Target.csv','ID\nKnown\nOther'),file('Source.csv','ID,External\nA,Known\nB,Missing\nC,"Known,Other"\nD,')]),ids=allocateImportIdentities(source)
 const jsonSafe=value=>{assert.notEqual(value,undefined);if(typeof value==='number')assert.ok(Number.isFinite(value));if(value&&typeof value==='object')for(const entry of Object.values(value))jsonSafe(entry)}
 const run=override=>preview(source,{name:'Unmapped',tables:{'Source.csv':{columns:{'column-2':override}}}},ids)
 const unmapped=run({type:'relation'});jsonSafe(unmapped);assert.equal(Object.hasOwn(unmapped.columnPreviews['Source.csv'][1],'relationTarget'),false)
 assert.equal(unmapped.schemaDraft.tables[1].fields[1].type,'text');assert.ok(unmapped.report.diagnostics.some(d=>d.code==='LINK_TARGET_REQUIRED'))
 assert.deepEqual(unmapped.records.filter(r=>r.tableKey==='Source.csv').map(r=>r.fields[ids.tables['Source.csv'].fields['column-2']]),['Known','Missing','Known,Other',''])
 for(const result of [unmapped,run({type:'relation',relationTableKey:''}),run({type:'relation',relationTableKey:'unknown'})]){
  jsonSafe(result);const links=result.report.tables[1].links[0];assert.equal(links.referencesRead,4);assert.equal(links.unresolved,4);assert.equal(links.resolved,0);assert.equal(result.acknowledgments.unresolved,true);assert.equal(result.links.length,0)
 }
 const mapped=run({type:'relation',relationTableKey:'Target.csv'});jsonSafe(mapped);assert.equal(mapped.schemaDraft.tables[1].fields[1].type,'relation');assert.equal(mapped.report.tables[1].links[0].resolved,3);assert.equal(mapped.report.tables[1].links[0].unresolved,1);assert.notEqual(mapped.fingerprint,unmapped.fingerprint);assert.equal(JSON.stringify(mapped.identities),JSON.stringify(unmapped.identities))
 const matchable=prepareCsvSource([file('Target.csv','ID\nKnown'),file('Source.csv','ID,External\nA,Known')]),cleared=preview(matchable,{name:'Cleared',tables:{'Source.csv':{columns:{'column-2':{type:'relation',relationTableKey:''}}}}});jsonSafe(cleared);assert.equal(cleared.schemaDraft.tables[1].fields[1].type,'text');assert.ok(cleared.report.diagnostics.some(d=>d.code==='LINK_TARGET_REQUIRED'));assert.equal(cleared.report.tables[1].links[0].unresolved,1)
 const skipped=run({type:'relation',skip:true});jsonSafe(skipped);assert.equal(skipped.schemaDraft.tables[1].fields.length,1);assert.equal(skipped.report.tables[1].links[0].referencesRead,4);assert.equal(skipped.report.tables[1].links[0].unresolved,4);assert.equal(skipped.report.tables[1].columns[1].skippedNonempty,3)
})
