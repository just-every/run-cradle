import assert from 'node:assert/strict'

// Retain counts and safe request coordinates, never console text or query strings:
// the real local sign-in journey visits one-use credential URLs.
export function browserObservations(page,origin){
 const consoleErrors=[],failedRequests=[]
 let pageErrors=0,externalRequests=0
 page.on('pageerror',()=>{pageErrors++})
 page.on('request',request=>{if(new URL(request.url()).origin!==origin)externalRequests++})
 page.on('requestfailed',request=>failedRequests.push(request))
 page.on('console',message=>{
  if(message.type()!=='error')return
  const location=message.location().url
  const text=message.text(),category=/hydrat/i.test(text)?'hydration':/unique.*key/.test(text)?'list-key':/cannot be a (child|descendant)|cannot contain/.test(text)?'document-nesting':/error occurred/.test(text)?'component-error':undefined
  const attributes=category==='hydration'?[...new Set([...text.matchAll(/^[+-]\s+([A-Za-z][A-Za-z0-9:_-]*)=/gm)].map(match=>match[1]))]:[]
  const components=category==='hydration'?[...new Set([...text.matchAll(/^\s+<([A-Z][A-Za-z0-9]+)\b/gm)].map(match=>match[1]))].slice(-12):[]
  consoleErrors.push({path:location?new URL(location).pathname:null,networkError:/^Failed to load resource: net::(ERR_[A-Z_]+)$/.exec(text)?.[1]??null,...(category?{category}:{}),...(attributes.length?{attributes}:{}),...(components.length?{components}:{})})
 })
 return {
  assertClean(abortedRequest,label=''){
   assert.equal(pageErrors,0,'No unexpected browser page errors')
   assert.equal(externalRequests,0,'No requests outside the local application')
   if(abortedRequest){
    assert.equal(failedRequests.length,1,'Exactly the deliberately aborted undo request fails')
    assert.ok(failedRequests[0]===abortedRequest,'The failed request is the exact second undo request intercepted by the test')
    assert.equal(abortedRequest.method(),'POST')
    assert.equal(abortedRequest.failure()?.errorText,'net::ERR_CONNECTION_RESET')
    assert.deepEqual(consoleErrors,[{path:new URL(abortedRequest.url()).pathname,networkError:'ERR_CONNECTION_RESET'}],'Only the deliberately aborted undo request emits a console error')
   }else{
    assert.equal(failedRequests.length,0,'No unexpected failed browser requests: '+JSON.stringify(failedRequests.map(request=>({method:request.method(),path:new URL(request.url()).pathname,failure:request.failure()?.errorText}))))
    assert.deepEqual(consoleErrors,[],'No unexpected browser console errors'+(label?' at '+label:''))
   }
   return {pageErrors,externalRequests,consoleErrors:consoleErrors.length,failedRequests:failedRequests.length,expectedAbortedUndoRequests:abortedRequest?1:0}
  }
 }
}
