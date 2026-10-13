import {assertNoBrowserSession} from './session-cookies.mjs'
import assert from 'node:assert/strict'
import path from 'node:path'
import {accessibilityCaptureOnly,accessibilityContextOptions,accessibilityEvidence,auditAccessibility} from './accessibility-evidence.mjs'

export async function verifyIdentityAndRecovery({browser,context,page,viewport,origin,evidence,copy,link,accessibilityScreens=[]}) {
  const capture=async(target,screen,file)=>{
    if(accessibilityEvidence){
      const audit=await auditAccessibility(target,{screen,width:viewport.width,output:evidence})
      const severe=[...audit.axe.wcag22aa,...audit.axe.targetSize].filter(violation=>['serious','critical'].includes(violation.impact))
      if(!accessibilityCaptureOnly)assert.deepEqual(severe.map(violation=>violation.id),[],`${screen} WCAG 2.2 AA serious/critical accessibility`)
      accessibilityScreens.push({screen,width:viewport.width,wcagFindings:audit.axe.wcag22aa.length,targetSizeFindings:audit.axe.targetSize.length,controls:audit.layout.controls.length,tabbable:audit.keyboard.tabbableCount,tabOrderComplete:audit.keyboard.missing.length===0,keyboardActivations:audit.keyboard.activations.length,smallTargets:audit.layout.targetsBelow24.length})
    }else await target.screenshot({path:path.join(evidence,file),fullPage:true})
  }
  const rename=async name=>{
    const response=await context.request.get(origin+'/api/settings')
    assert.equal(response.status(),200,'Read current settings before rename')
    const {settings}=await response.json(), workspace=settings.workspace
    const proof=await context.request.get(origin+'/auth/csrf')
    assert.equal(proof.status(),200,'Obtain the current session CSRF proof')
    const {csrfToken}=await proof.json()
    const changed=await context.request.patch(origin+'/api/settings',{headers:{origin,'x-csrf-token':csrfToken},data:{version:settings.version,workspaceName:name,timezone:workspace.timezone,currency:workspace.currency,quietHoursStart:workspace.quietHoursStart,quietHoursEnd:workspace.quietHoursEnd}})
    assert.equal(changed.status(),200,'Rename through the authenticated settings API')
  }
  const anonymous=await browser.newContext(accessibilityContextOptions({viewport,javaScriptEnabled:false}))
  try {
    const publicPage=await anonymous.newPage()
    for(const name of ['North Quay','Cedar']) {
      await rename(name)
      await publicPage.goto(origin+'/')
      await publicPage.getByRole('link',{name:'Sign in',exact:true}).waitFor()
      assert.ok((await publicPage.locator('body').innerText()).includes(name),'The Lobby names the persisted rename')
      await capture(publicPage,`identity-${name.replace(' ','-').toLowerCase()}`,`identity-${name.replace(' ','-').toLowerCase()}-${viewport.width}.png`)
      await publicPage.goto(origin+'/signin')
      assert.equal(await publicPage.getByLabel('Email address').isVisible(),true)
      assert.equal(await publicPage.getByRole('button',{name:'Send sign-in link',exact:true}).isVisible(),true)
      assert.equal(await publicPage.getByRole('link',{name:'Back to home',exact:true}).count(),1)
      assert.equal(await publicPage.getByText(name,{exact:true}).count(),1)
      assert.doesNotMatch(await publicPage.locator('body').innerText(),/Checking sign-in|Welcome back/)
      await capture(publicPage,`signin-nojs-${name.replace(' ','-').toLowerCase()}`,`signin-nojs-${name.replace(' ','-').toLowerCase()}-${viewport.width}.png`)
    }
    {
      const response=await publicPage.goto(link)
      assert.equal(response.status(),400)
      await publicPage.getByRole('heading',{name:'This link is invalid or expired',exact:true}).waitFor()
      assert.equal(await publicPage.getByRole('button',{name:'Confirm',exact:true}).count(),0)
      assert.equal(await publicPage.getByRole('link',{name:'Request a new link',exact:true}).getAttribute('href'),'/signin')
      await assertNoBrowserSession(anonymous,origin)
      await capture(publicPage,'confirm-reused',`confirm-reused-${viewport.width}.png`)
    }
  } finally {await rename('My records');await anonymous.close()}
}
