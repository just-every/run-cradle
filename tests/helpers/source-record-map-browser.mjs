import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {adopt,reviewRecordedSource,finish} from './import-effects.mjs'
import {sourceRecordMapFixture,recordMapClient,parseRecordMapCsv,assertRecordMap,refuseRecordMaps} from './source-record-map-journey.mjs'

export async function sourceRecordMapBrowser(page,runtime,width,journey) {
 const h=await recordMapClient(runtime),fixture=await sourceRecordMapFixture(),job=await adopt(h,await reviewRecordedSource(h,fixture.preview))
 const receipt=`${h.origin}/app/records/?import=base&job=${job.id}&receipt=1`
 await page.goto(receipt)
 await page.getByRole('heading',{name:'Source record ID map',exact:true}).waitFor()
 assert.equal(await page.getByRole('link',{name:'Download ID map JSON',exact:true}).count(),0)
 await finish(h,job.id,'resume','completed')
 await page.reload()
 const csvLink=page.getByRole('link',{name:'Download ID map CSV',exact:true}),jsonLink=page.getByRole('link',{name:'Download ID map JSON',exact:true})
 await jsonLink.waitFor()
 await journey.capture('source-record-map-completed')
 const download=async(link)=>{
  const pending=page.waitForEvent('download');await journey.action(link)
  const file=await pending;assert.equal(await file.failure(),null)
  return readFile(await file.path(),'utf8')
 }
 const csv=await download(csvLink),json=JSON.parse(await download(jsonLink))
 // The desktop registration asserts correspondence; the phone pass records the same actual controls and downloads.
 if(width===1440){assert.deepEqual(parseRecordMapCsv(csv),json.records);await assertRecordMap(h,job,fixture,json.records)}
 const retainedHref=await jsonLink.getAttribute('href')
 await finish(h,job.id,'undo','undone')
 await refuseRecordMaps(h,job.id)
 const refused=await page.request.get(h.origin+retainedHref);assert.equal(refused.status(),409)
 assert.equal((await refused.json()).records,undefined)
 await page.reload()
 await page.getByRole('heading',{name:'Source record ID map',exact:true}).waitFor()
 assert.equal(await jsonLink.count(),0);assert.equal(await csvLink.count(),0)
 await journey.capture('source-record-map-undone')
}
