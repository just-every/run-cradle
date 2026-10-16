import {sessionCookieWithToken} from './session-cookies.mjs'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { expiredToken, revokedToken, authoritySessionControlsSql } from './session-controls.mjs'

export async function versionedSessionProof({page,origin,cookie,directory,member,campaignId,evidence}) {
  const sql=spawnSync('pnpm',['exec','wrangler','d1','execute','cradle','--local','--persist-to',directory,'--command',authoritySessionControlsSql(member,Date.now())],{encoding:'utf8',maxBuffer:16*1024*1024})
  assert.equal(sql.status,0,sql.stderr||sql.stdout)
  const resource=`/api/v1/apps/00000000000000000000000700/entities/00000000000000000000000701/records/${campaignId}`
  const positive=await fetch(origin+resource,{headers:{cookie}})
  assert.equal(positive.status,200,await positive.clone().text())
  let wire
  const capture=request=>{if(request.url().includes('/_serverFn/')&&decodeURIComponent(request.url()).includes('/api/v1/'))wire={url:request.url(),headers:request.headers()}}
  page.on('request',capture)
  await page.evaluate(async route=>{await window.__TSR_ROUTER__.navigate({to:route})},`/app/records/${resource.split('/')[4]}/${resource.split('/')[6]}/${campaignId}`)
  await page.waitForLoadState('networkidle');page.off('request',capture)
  assert.ok(wire,'The real installed client must emit the versioned generated request')
  const headers={...wire.headers};delete headers.cookie;delete headers.host
  assert.match(campaignId,/^[0-9A-HJKMNP-TV-Z]{26}$/)
  const snapshot=()=>{
    const result=spawnSync('pnpm',['exec','wrangler','d1','execute','cradle','--local','--persist-to',directory,'--json','--command',`SELECT id,name,version,updated_at FROM campaigns WHERE id='${campaignId}'`],{encoding:'utf8',maxBuffer:16*1024*1024})
    assert.equal(result.status,0,result.stderr||result.stdout)
    const rows=JSON.parse(result.stdout)[0].results;assert.equal(rows.length,1);return rows
  }
  const before=snapshot()
  const report=[]
  for(const [control,session] of [['valid',cookie],['missing',''],['expired',sessionCookieWithToken(cookie,expiredToken)],['revoked',sessionCookieWithToken(cookie,revokedToken)]]) {
    const response=await fetch(wire.url,{headers:{...headers,...(session?{cookie:session}:{})}}),body=await response.text()
    assert.equal(response.status,200)
    await writeFile(path.join(evidence,'versioned-latest.json'),JSON.stringify({control,wire,status:response.status,body},null,2))
    if(control==='valid'){assert.ok(body.includes(campaignId));assert.doesNotMatch(body,/isSerializedRedirect/)}
    else {assert.match(body,/"isSerializedRedirect":true/);assert.match(body,/signin/);assert.ok(!body.includes(campaignId));assert.doesNotMatch(body,/Maya Chen|Northstar/)}
    report.push({control,url:wire.url,status:response.status,headers:Object.fromEntries(response.headers),body})
  }
  const denied=await fetch(wire.url,{headers:{...headers,cookie,origin:'https://hostile.invalid','sec-fetch-site':'cross-site'}})
  assert.equal(denied.status,403);await denied.arrayBuffer()
  const after=snapshot();assert.deepEqual(after,before)
  await writeFile(path.join(evidence,'versioned-rows.json'),JSON.stringify({before,after},null,2))
  await writeFile(path.join(evidence,'versioned-wire.json'),JSON.stringify(report,null,2))
}
