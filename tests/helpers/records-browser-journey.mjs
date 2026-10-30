import {displayAction} from './records-table-tools.mjs'
import {impactReview} from './records-browser-review.mjs'
import assert from 'node:assert/strict'
import path from 'node:path'
import {writeFile} from 'node:fs/promises'
import {measureAccessibilityLayout} from './accessibility-axe.mjs'
import AxeBuilder from '@axe-core/playwright'
import { accessibilityAction, accessibilityCaptureOnly, accessibilityEvidence, accessibilitySetChecked, auditAccessibility } from './accessibility-evidence.mjs'
import { installKeyboardInteractions } from './accessibility-keyboard.mjs'
export function recordsJourney(page,origin,output,width,{allAxe=false,measureTargets=false}={}){
 installKeyboardInteractions(page)
 const checkpoints=[],errors=[];let previews=0;page.on('pageerror',e=>errors.push(e.message))
 async function capture(name,{viewport=false}={}){
  await page.waitForLoadState('networkidle')
  await page.waitForFunction(()=>!document.querySelector('[aria-busy="true"]'))
  if(!viewport)await page.evaluate(()=>scrollTo(0,0))
  const measuredLayout=measureTargets?await measureAccessibilityLayout(page):undefined
  if(measuredLayout)await writeFile(path.join(output,`${name}-${width}-layout.json`),JSON.stringify(measuredLayout,null,2))
  if(!accessibilityCaptureOnly)assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name}: page overflow`)

  let report,layout,evidence
  if(accessibilityEvidence){
   evidence=await auditAccessibility(page,{screen:name,width,output})
   report={violations:evidence.axe.wcag22aa}
   layout=evidence.layout
   if(!accessibilityCaptureOnly){
    assert.deepEqual(report.violations.filter(v=>['serious','critical'].includes(v.impact)),[],`${name}: WCAG 2.2 AA serious/critical accessibility`)
    assert.deepEqual(evidence.axe.targetSize.filter(v=>['serious','critical'].includes(v.impact)),[],`${name}: target-size serious/critical accessibility`)
   }
  }else{
   report=await new AxeBuilder({page}).analyze()
   assert.deepEqual(report.violations.filter(v=>allAxe||['serious','critical'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[],`${name}: accessibility`)
  }

  layout??=measuredLayout
  if(measureTargets){
   assert.equal(layout.viewportWidth,width,`${name}: actual viewport width`)
   assert.ok(layout.controls.some(control=>!control.inactive&&control.targetAreas.some(area=>area.pointerTarget)),`${name}: populated active touch targets`)
   assert.deepEqual(layout.targetsBelow24.map(control=>({name:control.name,selector:control.selectorPath,width:control.effectiveTargetWidth,height:control.effectiveTargetHeight,areas:control.targetAreas})),[],`${name} ${width}: every active touch target needs a measured 24x24px hit region`)
  }
  assert.deepEqual(errors,[],`${name}: page errors`)
  assert.equal(await page.locator('.cr-state[aria-busy="false"]').count(),0,`${name}: failed resource`)
  if(!accessibilityEvidence)await page.screenshot({path:path.join(output,`${name}-${width}.png`),fullPage:!viewport})
  checkpoints.push({
   name,width,serious:0,critical:0,pageOverflow:layout?.pageOverflow??false,
   ...(measureTargets?{viewportWidth:layout.viewportWidth,pageWidth:layout.pageWidth,smallTargetCount:layout.targetsBelow24.length,touchTargets:layout.controls.filter(control=>!control.inactive&&control.targetAreas.some(area=>area.pointerTarget)).map(control=>({name:control.name,width:control.effectiveTargetWidth,height:control.effectiveTargetHeight,hitAreaSquare24:control.targetMeets24px}))}:{}),
   ...(evidence?{
    wcagViolationCount:evidence.axe.wcag22aa.length,
    targetSizeViolationCount:evidence.axe.targetSize.length,
    controls:evidence.layout.controls.length,
    smallTargetCount:evidence.layout.targetsBelow24.length,
    tabbableCount:evidence.keyboard?.tabbableCount??null,
    tabOrderComplete:evidence.keyboard?.missing?.length===0,
    focusWithoutVisibleStyle:evidence.keyboard?.focusWithoutVisibleStyle?.length??null,
   }:allAxe?{axeViolations:report.violations.length}:{})
  })
 }
 async function action(target,key='Enter'){return accessibilityAction(page,target,key)}
 async function setChecked(target,checked=true){return accessibilitySetChecked(page,target,checked)}
 async function command(button,actionName){const pending=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/'+actionName));await action(button);const response=await pending;const body=await response.json();assert.equal(response.status(),200,JSON.stringify(body));assert.equal(body.data.state,'committed',JSON.stringify(body));return body.data.value}
 async function adopt(onReady){await action(page.getByRole('button',{name:'Preview schema changes',exact:true}));await page.getByRole('heading',{name:'Review schema changes',exact:true}).waitFor();await impactReview(page,{setChecked});await capture(previews++===0?'impact-preview':`impact-preview-${previews}`);await setChecked(page.getByLabel('I reviewed the data changes and owner access.'),true);const result=await command(page.getByRole('button',{name:'Adopt schema',exact:true}),'release.adopt');await page.getByRole('heading',{name:'Base ready',exact:true}).waitFor();await capture('adoption');if(onReady)await onReady(result);await action(page.getByRole('link',{name:/^Open /}).filter({hasText:/Open /}).last());await page.getByRole('button',{name:'New record',exact:true}).waitFor();return result}
 async function field(name,type='text',extra){await action(page.getByRole('button',{name:'Add field',exact:true}));const editor=page.locator('fieldset').filter({has:page.getByLabel('Field name',{exact:true})}).last();await editor.getByLabel('Field name',{exact:true}).fill(name);await editor.getByLabel('Field type',{exact:true}).selectOption(type);if(extra)await extra(editor)}
 async function record(values){await action(page.getByRole('button',{name:'New record',exact:true}));await page.getByRole('button',{name:'Save record',exact:true}).waitFor();if(accessibilityEvidence&&Object.values(values).some(value=>typeof value==='boolean'))await capture('record-form-boolean');for(const [label,value]of Object.entries(values)){const input=page.getByLabel(label,{exact:true});if(typeof value==='object'&&value.link){await action(page.getByRole('group',{name:label,exact:true}).getByText(value.link,{exact:true}))}else if(typeof value==='boolean'){await setChecked(input,value)}else if(typeof value==='object'&&value.select)await input.selectOption({label:value.select});else await input.fill(value)}const row=await command(page.getByRole('button',{name:'Save record',exact:true}),'record.create');await page.getByRole('button',{name:'New record',exact:true}).waitFor();return row}
 async function table(name){const query=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/query'));await displayAction(page,name,action);await query;await page.waitForFunction(()=>!document.querySelector('[aria-busy="true"]'));await page.getByRole('button',{name:'New record',exact:true}).waitFor()}
 return {action,setChecked,capture,command,adopt,field,record,table,errors,checkpoints}
}
