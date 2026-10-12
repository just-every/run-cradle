import assert from 'node:assert/strict'

/** Delay real emitted assets to exercise the server-rendered document before React attaches. */
export async function formHydration(page){
 let release;const assets=new Promise(resolve=>release=resolve)
 const handler=async route=>{await assets;await route.continue()}
 await page.route('**/assets/*.js',handler)
 try{
  await page.reload({waitUntil:'commit'})
  await page.getByRole('heading',{name:'New opportunity',exact:true}).waitFor()
  for(const name of ['Deal','Value','Approved'])assert.equal(await page.getByLabel(name,{exact:true}).isDisabled(),true,`${name}: response control must wait for hydration`)
  assert.equal(await page.getByRole('button',{name:'Submit',exact:true}).isDisabled(),true)
  release();await page.waitForLoadState('networkidle')
  await page.waitForFunction(()=>document.querySelector('.cr-form-fields')?.disabled===false)
  for(const name of ['Deal','Value','Approved'])assert.equal(await page.getByLabel(name,{exact:true}).isDisabled(),false)
  return {blockedBeforeHydration:true,enabledAfterHydration:true}
 }finally{release();await page.unroute('**/assets/*.js',handler)}
}
