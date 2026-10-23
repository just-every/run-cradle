import assert from 'node:assert/strict'
import {expect} from '@playwright/test'
import {readdir} from 'node:fs/promises'
import path from 'node:path'
/** Delay only our real JavaScript responses so the first file selection precedes hydration. */
export async function preHydrationImport(page,h,width,capture){
 let release;const gate=new Promise(resolve=>{release=resolve}),pattern=/\/assets\/.*\.js(?:\?.*)?$/,handler=async route=>{await gate;await route.continue()}
 await page.route(pattern,handler)
 const errors=[];const onError=error=>errors.push(error.message);page.on('pageerror',onError)
 try{
  await page.goto(h.origin+'/app/records/?import=base',{waitUntil:'commit'})
  const directory=path.resolve('tests/fixtures/base-transfer/crm-example/csv'),files=(await readdir(directory)).filter(name=>name.endsWith('.csv')).map(name=>path.join(directory,name)),name='synthetic-cradle-before-hydration-'+width
  await page.getByLabel('Base name',{exact:true}).fill(name)
  const input=page.getByLabel('CSV files',{exact:true});await input.setInputFiles(files)
  assert.equal(await input.evaluate(node=>node.files.length),files.length)
  assert.equal(await page.getByRole('button',{name:'Preview import',exact:true}).isEnabled(),false,'This selection actually precedes hydration')
  release();await page.waitForLoadState('load')
  await expect(page.getByRole('button',{name:'Preview import',exact:true})).toBeEnabled()
  await expect(page.getByLabel('Base name',{exact:true})).toHaveValue(name)
  const response=page.waitForResponse(r=>r.url().endsWith('/base-import/preview')&&r.request().method()==='POST')
  await page.getByRole('button',{name:'Preview import',exact:true}).click();const result=await response,body=await result.json();assert.equal(result.status(),200,JSON.stringify(body));assert.equal(body.data.options.name,name)
  assert.deepEqual(errors,[]);if(capture)await capture('import-before-hydration')
 }finally{release();await page.unroute(pattern,handler);page.off('pageerror',onError)}
}
