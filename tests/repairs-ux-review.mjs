import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
const require=createRequire(import.meta.url),{build}=require('../node_modules/.pnpm/esbuild@0.28.1/node_modules/esbuild')
await mkdir('.wrangler',{recursive:true})
const directory=await mkdtemp(resolve('.wrangler/ux-ssr-'))
await build({stdin:{contents:`export {createElement as h} from 'react'; export {renderToStaticMarkup as render} from 'react-dom/server'; export {DocumentDataContext} from './src/core/app/document-data'; export {ContractorSelection} from './src/ui/repairs/contractor-selection'; export {QuoteReviewContent} from './src/ui/repairs/manual-quotes'; export {SourceText} from './src/ui/evidence/source-page'; export * from './src/apps/repairs/manual-quote-source'; export * from './src/ui/repairs/navigation'; export {repairRef, REPAIRS_APP_ID} from './src/apps/repairs/model';`,resolveDir:process.cwd()},outfile:directory+'/views.mjs',bundle:true,platform:'node',format:'esm',packages:'external',loader:{'.css':'empty'},jsx:'automatic',logLevel:'silent'})
const r=await import(directory+'/views.mjs')
after(()=>rm(directory,{recursive:true,force:true}))
const id='01ARZ3NDEKTSV4RRFFQ69G5FAA',other='01ARZ3NDEKTSV4RRFFQ69G5FAB',work={ref:r.repairRef('workOrders',id),version:2},contractor={ref:r.repairRef('contractors',other),version:1}
const amount={minor:'200001',currency:'AUD',scale:2}
const terms={workOrder:work,contractor,scopeHash:'a'.repeat(64),total:amount,taxIncluded:true,lineItems:[{description:'Repair fan',total:amount}],exclusions:['Compressor excluded'],expiresAt:'2099-01-01T00:00:00.000Z',offeredSlot:null}
const quote={...terms,id:'quote',version:1,state:'received',approvalId:null,evidence:[{sourceId:id,sourceVersion:1}]}
const review={workOrder:work,store:r.repairRef('stores',id),scopeHash:terms.scopeHash,contractor,contractorName:'Synthetic Refrigeration',canCapture:true,controlEpoch:2,items:[{quote,issues:[],approvalRequired:true}]}
const html=(component,props,seed={})=>r.render(r.h(r.DocumentDataContext,{value:seed},r.h(component,props)))
test('case/quote continuation stays within the repair app and preserves cited version',()=>{
 assert.equal(r.repairHref(work.ref),`/app/repairs/${id}`)
 assert.equal(r.repairHref({...work.ref,entityId:contractor.ref.entityId}),null)
 assert.equal(r.repairHref({...work.ref,appId:other}),null)
 assert.equal(r.repairHref({...work.ref,recordId:'../../elsewhere'}),null)
 assert.equal(r.contractorReference({state:'redacted'}),null)
 assert.deepEqual(r.contractorReference({state:'value',value:contractor.ref}),contractor.ref)
 assert.equal(r.quoteSourceHref(id,7,work.ref),`/app/evidence/${id}?version=7&repairId=${id}`)
})
test('assigned contractor renders as the current choice; missing or inactive eligibility cannot imply an available change',()=>{
 const path=`/api/v1/repairs/${id}/contractors`,data={workOrder:work,controlEpoch:2,caseState:'active',items:[{contractor,name:'Synthetic Refrigeration',evidence:[]}]}
 const render=(current,patch={})=>html(r.ContractorSelection,{id,current,onChanged(){}},{[path]:{data:{...data,...patch}}})
 const assigned=render(contractor.ref)
 assert.match(assigned,/Synthetic Refrigeration/);assert.match(assigned,/Change contractor/)
 assert.doesNotMatch(assigned,/type="radio"|Select contractor/)
 const fresh=render(null);assert.match(fresh,/type="radio"/);assert.match(fresh,/Select contractor/)
 assert.match(render(contractor.ref,{items:[]}),/Current eligibility needs review/)
 assert.match(render(contractor.ref,{caseState:'paused'}),/disabled="">Change contractor/)
})
test('saved quotes precede the closed entry form; exclusions, threshold warning and exact source remain available',()=>{
 const saved=html(r.QuoteReviewContent,{id,data:review})
 assert.ok(saved.indexOf('Repair fan')<saved.indexOf('Add another quote'))
 assert.match(saved,/Compressor excluded/);assert.match(saved,/Above A\$2,000/)
 assert.match(saved,/version=1&amp;repairId=/)
 assert.match(saved,/<details class="cr-detail"><summary>Add another quote/)
 const empty=html(r.QuoteReviewContent,{id,data:{...review,items:[]}})
 assert.match(empty,/<details class="cr-detail" open=""><summary>Add a quote/)
 const restricted=html(r.QuoteReviewContent,{id,data:{...review,canCapture:false}})
 assert.doesNotMatch(restricted,/Record quote evidence/);assert.match(restricted,/Capture requires active manual work/)
})
test('recognized source envelope exposes original text first without losing or interpreting exact bytes',()=>{
 const original='Written quotation <script>alert(1)</script>\nExact recorded terms:\n{"quoted":"text"}\n  trailing spaces  '
 const captured=r.manualQuoteSource(original,terms),parsed=r.splitManualQuoteSource(captured)
 assert.equal(parsed.original,original);assert.equal(parsed.terms,JSON.stringify(terms))
 const page=html(r.SourceText,{text:captured,manualQuote:true})
 assert.ok(page.indexOf('Written quotation')<page.indexOf('<details'))
 assert.match(page,/&lt;script&gt;/);assert.doesNotMatch(page,/<script>/)
 assert.match(page,/Manual quote transcription/);assert.match(page,/Recorded terms and technical details/)
 for(const text of ['An ordinary original source '+JSON.stringify(terms),captured+'broken',captured.replace('"taxIncluded":true','"taxIncluded":"true"')]){
  assert.equal(r.splitManualQuoteSource(text),null)
  assert.doesNotMatch(html(r.SourceText,{text,manualQuote:true}),/<details/)
 }
 assert.doesNotMatch(html(r.SourceText,{text:captured,manualQuote:false}),/<details/)
})
