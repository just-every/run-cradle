import assert from 'node:assert/strict'

// Only the paid provider boundary is substituted; request preparation, model
// execution, persistence and erasure all use the emitted installation.
export function clauseAnalysisFixture() {
 let calls=0
 return {
  configuration:{AI_PROVIDER_API_KEY:'synthetic-clause-provider-key',AI_MODEL:'clause-model'},
  async providerFetch(request){
   assert.equal(request.url,'https://api.openai.com/v1/responses')
   calls++
   return Response.json({id:`clause-response-${calls}`,model:'clause-model',status:'completed',usage:{input_tokens:9,output_tokens:4},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({content:'Lifecycle analysis: review supplier evidence before launch.',proposedLens:null})}]}]})
  },
  async complete(h,campaignId){
   const command=async(action,input)=>{
    const response=await h.request(h.ownerSession,`/api/v1/commands/${action}`,{method:'POST',body:JSON.stringify({commandId:h.r.createUlid(),expected:[],input})})
    const payload=await response.json();assert.equal(response.status,200,JSON.stringify(payload.error));return payload.data.value
   }
   const settings=await h.request(h.ownerSession,'/api/v1/settings')
   assert.equal(settings.status,200)
   await command('settings.update',{version:(await settings.json()).data.version,changes:{aiEnabled:true,aiDailyCeiling:100}})
   const requested=await command('launch.analysis.request',{feature:'campaign-brief',campaignId})
   const before=calls
   await(await h.runtime.getWorker()).scheduled({cron:'* * * * *',scheduledTime:Date.now()})
   assert.equal(calls,before+1,'The requested campaign analysis reaches the provider edge once')
   const response=await h.request(h.ownerSession,`/api/v1/launch/analysis-requests/${requested.requestId}`)
   assert.equal(response.status,200)
   const result=(await response.json()).data
   assert.equal(result.state,'Complete',JSON.stringify(result.error))
   const analysis=await h.db.prepare('SELECT * FROM launch_analyses WHERE id=?').bind(result.analysis.id).first()
   assert.equal(analysis.subject_id,campaignId)
   return analysis.id
  },
 }
}
