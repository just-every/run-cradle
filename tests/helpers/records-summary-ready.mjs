import assert from 'node:assert/strict'

// A complete summary streams revision-fenced pages. Bound each page's progress
// with the normal browser timeout instead of racing the entire scan against it.
export async function waitForSavedViewSummary(page, activate) {
 const requests=[]
 const matches=request=>request.method()==='POST'&&/\/api\/v1\/views\/[^/]+\/query$/.test(new URL(request.url()).pathname)&&Array.isArray(request.postDataJSON()?.fields)
 const collect=request=>{if(matches(request))requests.push(request)}
 page.on('requestfinished',collect)
 try{
  await activate()
  let cursor
  do{
   if(!requests.length)await page.waitForEvent('requestfinished',{predicate:matches})
   const request=requests.shift(),response=await request.response()
   assert.equal(response.status(),200,await response.text())
   assert.equal(request.postDataJSON().cursor,cursor,'Summary pages follow the returned cursor')
   const {data}=await response.json()
   cursor=data.records.nextCursor??undefined
  }while(cursor)
  await page.getByRole('region',{name:'Saved view summaries',exact:true}).locator('dd').first().waitFor()
 }finally{page.off('requestfinished',collect)}
}
