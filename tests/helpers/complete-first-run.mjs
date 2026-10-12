import assert from 'node:assert/strict'

/** Finish an otherwise fresh fixture through the native first-owner form. */
export async function completeFirstRun(origin,cookie,send=fetch){
 const page=await send(origin+'/setup',{redirect:'manual',headers:{cookie}})
 if(page.status===303){assert.equal(new URL(page.headers.get('location'),origin).pathname,'/app');return}
 assert.equal(page.status,200,'The first owner can open setup')
 const html=await page.text(),form=new URLSearchParams()
 const decode=value=>value.replace(/&(?:amp|quot|lt|gt|#39);/g,entity=>({'&amp;':'&','&quot;':'"','&lt;':'<','&gt;':'>','&#39;':"'"})[entity])
 for(const input of html.match(/<input\b[^>]*>/g)??[]){
  const name=/\bname="([^"]+)"/.exec(input)?.[1],value=/\bvalue="([^"]*)"/.exec(input)?.[1]
  if(name&&value!==undefined)form.set(name,decode(value))
 }
 for(const name of ['csrf','name','timezone','currency'])assert.ok(form.get(name),'Native setup provides its required fields')
 const response=await send(origin+'/setup',{method:'POST',redirect:'manual',headers:{cookie,origin,'content-type':'application/x-www-form-urlencoded'},body:form.toString()})
 assert.equal(response.status,303,'The current first owner completes setup')
 assert.equal(new URL(response.headers.get('location'),origin).pathname,'/app')
}
