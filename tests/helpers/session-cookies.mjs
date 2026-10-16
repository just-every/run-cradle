import assert from 'node:assert/strict'

/** Parse actual Cookie-header pairs, retaining all issued names and values. */
export function browserCookies(header,origin) {
  assert.ok(typeof header==='string'&&header.trim(),'The sign-in flow issued cookies')
  return header.split(';').map(pair=>{
    const separator=pair.indexOf('='),name=pair.slice(0,separator).trim(),value=pair.slice(separator+1).trim()
    assert.ok(separator>0&&name&&value,'The issued cookie pair is nonempty')
    return {name,value,url:origin}
  })
}

/** These controls replace the real session value, never its current namespace. */
export function sessionCookieWithToken(issued,token) {
  const cookies=browserCookies(issued)
  assert.equal(cookies.length,1,'The ordinary sign-in flow issued one session cookie')
  return `${cookies[0].name}=${token}`
}

export async function assertNoBrowserSession(context,origin,allowedNames=[]) {
  assert.deepEqual((await context.cookies(origin)).map(cookie=>cookie.name).sort(),[...allowedNames].sort(),'No cookie beyond the pre-existing gate was issued')
  const response=await context.request.get(origin+'/auth/session',{maxRedirects:0})
  assert.equal(response.status(),401,'The browser has no authenticated session')
}

/** Identify authority by the public session endpoint, then check its protection. */
export async function assertHttpOnlyBrowserSession(context,origin) {
  const sessions=[]
  for(const cookie of await context.cookies(origin)) {
    const response=await fetch(origin+'/auth/session',{redirect:'manual',headers:{cookie:`${cookie.name}=${cookie.value}`}})
    if(response.status===200)sessions.push(cookie)
    else assert.equal(response.status,401,'A non-session cookie grants no authority')
    await response.body?.cancel()
  }
  assert.equal(sessions.length,1,'One issued cookie authenticates the browser')
  assert.equal(sessions[0].httpOnly,true,'The authenticating cookie is HttpOnly')
}
