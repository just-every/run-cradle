import assert from 'node:assert/strict'

export async function recordTemplateAutomationBrowser(page,j,h,width,{appId,parentId,source,template}){
 await page.goto(h.origin+'/app/automations')
 const panel=page.getByRole('region',{name:'Record automations',exact:true})
 await panel.getByLabel(/^Application/).selectOption(appId)
 await panel.getByLabel(/^Record type/).selectOption(parentId)
 await j.action(panel.getByRole('button',{name:'New automation',exact:true}))
 const form=page.getByRole('form',{name:'Automation definition',exact:true}),name=`synthetic-cradle-${width+31}`
 await form.getByLabel('Automation name',{exact:true}).fill(name)
 await form.getByLabel('Action',{exact:true}).selectOption('apply_record_template')
 await form.getByLabel('Template table',{exact:true}).selectOption(parentId)
 await form.getByLabel('Record template',{exact:true}).selectOption(template.id)
 await j.setChecked(form.getByLabel('Enable after saving'),false)
 await j.capture('record-template-automation-configured')
 const save=page.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith('/api/user-automations'))
 await j.action(form.getByRole('button',{name:'Save automation',exact:true}))
 const response=await save,body=await response.json();assert.equal(response.status(),201,JSON.stringify(body));assert.equal(body.data.result.value.enabled,false)
 await j.action(panel.getByRole('button',{name:`Edit ${name}`,exact:true}))
 const test=page.getByRole('region',{name:'Test automation',exact:true})
 await test.getByLabel(/^Test record/).selectOption(source.id)
 const pending=page.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith('/test'))
 await j.action(test.getByRole('button',{name:'Run test',exact:true}))
 const tested=await pending,result=await tested.json();assert.equal(tested.status(),200,JSON.stringify(result));assert.equal(result.data.state,'Complete');assert.equal(result.data.steps[0].output.childCount,template.children.length);assert.equal(result.data.steps[0].output.created,false)
 await j.action(test.locator('summary').filter({hasText:/^Input and output$/}))
 await test.getByText(template.name+' · '+template.children.length+' child records',{exact:true}).waitFor()
 await j.capture('record-template-automation-preview')
 return {automationId:body.data.result.value.id,childCount:result.data.steps[0].output.childCount}
}
