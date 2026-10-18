import assert from 'node:assert/strict'

// Called by the existing walkthrough registration at both required viewports.
export async function verifyCurrentLensScreens({h,page,command,capture}) {
 const entities={campaign:'00000000000000000000000701',risk:'00000000000000000000000704',lens:'00000000000000000000000706'}
 const expected=(kind,row)=>[{ref:{appId:'00000000000000000000000700',entityId:entities[kind],recordId:row.id},version:row.version}]
 const create=async(action,input,revisions=[]) => (await command(action,input,revisions)).data.value
 const width=page.viewportSize().width, prefix=`LENS-CURRENT-${width}`
 let campaign=await create('campaign.create',{fields:{code:prefix,name:'Current supplier readiness',ownerId:h.owner,startDate:'2026-01-01',launchDate:'2026-12-01',objective:'Confirm supplier readiness',statusSummary:'Review current evidence',phase:'Planning',status:'On track',health:70,budgetMinor:0,spendMinor:0,tags:[],customFields:{}}})
 const riskFields={campaignId:campaign.id,ownerId:h.owner,severity:'High',dueDate:'2026-12-01',signal:'Original supplier evidence',mitigation:'Review current evidence'}
 const first=await create('risk.create',{fields:{...riskFields,title:`${prefix} Packaging evidence`}})
 let second=await create('risk.create',{fields:{...riskFields,title:`${prefix} Shipping evidence`}})
 const definition={name:`Supplier evidence ${width}`,description:'Current evidence across active campaigns.',recordType:'Risk',conditions:[{field:'title',operator:'contains',value:prefix}],sort:{field:'title',direction:'asc'},fields:['title','severity','state','signal','mitigation','dueDate','campaign'],display:'Cards'}
 const lens=await create('lens.save',{definition})
 const evaluation=async()=>{
  const response=await h.request(h.ownerSession,`/api/lenses/${lens.id}?view=results`)
  assert.equal(response.status,200)
  return response.json()
 }
 await page.goto(`${h.origin}${lens.shareUrl}`)
 await page.getByRole('heading',{name:definition.name,exact:true}).waitFor()
 await page.waitForLoadState('networkidle')
 const results=page.getByRole('region',{name:'Lens results',exact:true})
 const detail=page.getByRole('region',{name:'Selected record detail',exact:true})
 assert.equal(await page.getByRole('status').last().textContent(),'2 matching records')
 assert.match(await page.getByRole('region',{name:'Condition summary'}).textContent(),new RegExp(prefix))
 await results.getByRole('button',{name:new RegExp(second.title)}).click()
 await detail.getByRole('heading',{name:second.title,exact:true}).waitFor()
 assert.match(await detail.textContent(),/Original supplier evidence/)
 const before=await evaluation()
 assert.deepEqual(before.selectedDetail,before.items[0])
 await capture('clause-lens-current-selected')
 second=await create('risk.patch',{id:second.id,changes:{signal:'Updated supplier evidence'}},expected('risk',second))
 assert.match(await detail.textContent(),/Original supplier evidence/,'Selected detail stays in its evaluation until refresh')
 await page.getByRole('button',{name:'Refresh results',exact:true}).click()
 await detail.getByText('Updated supplier evidence',{exact:true}).waitFor()
 assert.equal(await page.getByRole('status').last().textContent(),'2 matching records')
 await capture('clause-lens-current-refreshed')
 await page.reload()
 await page.getByRole('heading',{name:definition.name,exact:true}).waitFor()
 assert.equal((await evaluation()).items.find(row=>row.id===second.id).signal,'Updated supplier evidence')
 campaign=await create('campaign.archive',{id:campaign.id},expected('campaign',campaign))
 await page.getByRole('button',{name:'Refresh results',exact:true}).click()
 await page.getByRole('heading',{name:'No matching records',exact:true}).waitFor()
 assert.equal(await page.getByRole('status').last().textContent(),'0 matching records')
 assert.equal(await page.getByRole('region',{name:'Selected record detail',exact:true}).count(),0)
 const empty=await evaluation()
 assert.equal(empty.selectedDetail,null)
 assert.deepEqual(empty.items,[])
 await capture('clause-lens-current-empty')
 await create('lens.delete',{id:lens.id},expected('lens',lens))
 await create('campaign.delete',{id:campaign.id,confirmationCode:campaign.code},expected('campaign',campaign))
}
