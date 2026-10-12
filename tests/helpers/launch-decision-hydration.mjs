import assert from 'node:assert/strict'

/** Delay real emitted assets so the server-rendered decision form is checked before React attaches. */
export async function decisionHydration(page){
 let release;const assets=new Promise(resolve=>release=resolve)
 const handler=async route=>{await assets;await route.continue()}
 await page.route('**/assets/*.js',handler)
 try{
  await page.reload({waitUntil:'commit'})
  const outcome=page.getByLabel('Outcome',{exact:true})
  await outcome.waitFor()
  assert.equal(await outcome.isDisabled(),true,'Outcome must wait for hydration')
  assert.equal(await page.getByLabel('Rationale',{exact:false}).isDisabled(),true,'Rationale must wait for hydration')
  assert.equal(await page.getByRole('button',{name:'Record outcome',exact:true}).isDisabled(),true)
  release();await page.waitForLoadState('networkidle')
  await page.waitForFunction(()=>document.querySelector('select[aria-label="Outcome"]')?.disabled===false)
  assert.equal(await page.getByLabel('Rationale',{exact:false}).isDisabled(),false)
  await outcome.selectOption('Rejected');await page.getByRole('button',{name:'Record rejected',exact:true}).waitFor({timeout:5000})
  await outcome.selectOption('');await page.getByRole('button',{name:'Record outcome',exact:true}).waitFor({timeout:5000})
  return {blockedBeforeHydration:true,enabledAfterHydration:true}
 }finally{release();await page.waitForLoadState('networkidle');await page.unroute('**/assets/*.js',handler)}
}
