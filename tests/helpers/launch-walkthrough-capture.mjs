import assert from 'node:assert/strict'
import {writeFile} from 'node:fs/promises'
import path from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import {stringifySafeEvidence} from './accessibility-redaction.mjs'
import {accessibilityCaptureOnly,accessibilityEvidence,auditAccessibility} from './accessibility-evidence.mjs'

/** The same layout, accessibility, footer and evidence assertions apply to
 * every screen in both independently scheduled walkthrough groups. */
export function launchWalkthroughCapture({page,receipt,viewport,output,workspaceName}){
 return async(name,{operatorName='Mira Example',...options}={})=>{
   await page.waitForLoadState('networkidle');await page.evaluate(()=>window.scrollTo(0,0))
   if(!accessibilityCaptureOnly)assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name} page overflow`)
   let evidence,violations
   if(accessibilityEvidence){
    evidence=await auditAccessibility(page,{screen:name,width:viewport.width,output,...options})
    violations=[...evidence.axe.wcag22aa,...evidence.axe.targetSize].filter(v=>['serious','critical'].includes(v.impact))
    if(!accessibilityCaptureOnly){
     assert.deepEqual(violations.map(v=>v.id),[],`${name} WCAG 2.2 AA and target-size serious/critical accessibility`)
     assert.equal(evidence.layout.pageOverflow,false,`${name} page overflow`)
    }
   }else{
    violations=(await new AxeBuilder({page}).analyze()).violations.filter(v=>['serious','critical'].includes(v.impact))
    if(violations.length){await writeFile(path.join(output,`axe-failure-${name}-${viewport.width}.json`),stringifySafeEvidence(violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))));await page.screenshot({path:path.join(output,`failed-${name}-${viewport.width}.png`),fullPage:true})}
    assert.deepEqual(violations.map(v=>v.id),[],`${name} accessibility`)
   }
   if(viewport.width===1440){const footer=page.locator('.operator-rail .operator-rail-footer');assert.ok(await footer.evaluate(el=>{const box=el.getBoundingClientRect();return box.top>=0&&box.bottom<=innerHeight&&box.height>0}),'Full operator row visible');assert.equal(await footer.locator('strong').innerText(),operatorName);assert.equal(await footer.locator('small').innerText(),workspaceName,'Workspace identity visible')}
   const file=accessibilityEvidence?`a11y-${name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}-${viewport.width}.png`:`${name}-${viewport.width}.png`
   if(!accessibilityEvidence)await page.screenshot({path:path.join(output,file),fullPage:true})
   receipt.screens.push({file,viewport,overflow:false,seriousCritical:0,...(evidence?{wcagViolationCount:evidence.axe.wcag22aa.length,targetSizeViolationCount:evidence.axe.targetSize.length,smallTargetCount:evidence.layout.targetsBelow24.length,controls:evidence.layout.controls.length,tabOrderComplete:evidence.keyboard?.missing?.length===0,tabbableCount:evidence.keyboard?.tabbableCount??null}: {})})
  }
}
