import {generateKeyPairSync} from 'node:crypto'
import assert from 'node:assert/strict'
import {createUlid} from '../../src/core/shared/ids.ts'
const privateKey=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}}).privateKey
export async function warehouseBrowser(page,h,journey,width){
 await page.goto(h.origin+'/app/settings')
 await page.waitForFunction(()=>window.__TSR_ROUTER__?.state.location.pathname==='/app/settings')
 await page.getByText('Scheduled warehouse exports',{exact:true}).click()
 const panel=page.getByRole('region',{name:'Warehouse exports',exact:true})
 for(const destination of ['r2','s3','bigquery','snowflake']){
  const format=destination==='r2'||destination==='bigquery'?'csv':'parquet',name=`synthetic-cradle-91-${destination}-${width}`
  await panel.getByRole('textbox',{name:'Export name',exact:true}).fill(name)
  await panel.getByRole('checkbox',{name:'Automation acceptance',exact:true}).check()
  await panel.getByRole('combobox',{name:/^Destination/}).selectOption(destination)
  await panel.getByRole('combobox',{name:/^File format/}).selectOption(format)
  if(destination==='s3'){
   for(const [label,value]of [['S3 endpoint','https://warehouse-bucket.example.com'],['S3 region','us-east-1'],['S3 bucket','synthetic-cradle-bucket'],['S3 prefix','analysis'],['S3 access key','synthetic-cradle-91'],['S3 secret key','synthetic-cradle-92']])await panel.getByLabel(label,{exact:true}).fill(value)
  }
  if(destination==='bigquery'){
   for(const [label,value]of [['BigQuery project','synthetic-cradle-93'],['BigQuery dataset','synthetic_cradle_93'],['BigQuery table prefix','synthetic_cradle_93_'],['BigQuery location','US']])await panel.getByLabel(label,{exact:true}).fill(value)
  }
  if(destination==='snowflake'){
   for(const [label,value]of [['Snowflake account','synthetic-cradle-95'],['Snowflake user','SYNTHETIC_CRADLE_95'],['Snowflake database','SYNTHETIC_CRADLE_95'],['Snowflake schema','PUBLIC'],['Snowflake table prefix','synthetic_cradle_95_'],['Snowflake stage','SYNTHETIC_CRADLE_STAGE'],['Stage S3 endpoint','https://warehouse-bucket.example.com'],['Stage S3 region','us-east-1'],['Stage S3 bucket','synthetic-cradle-bucket'],['Stage S3 prefix','analysis']])await panel.getByLabel(label,{exact:true}).fill(value)
   await panel.getByLabel('S3 access key',{exact:true}).fill('synthetic-cradle-91')
   await panel.getByLabel('S3 secret key',{exact:true}).fill('synthetic-cradle-92')
  }
  await journey.capture(`warehouse-${destination}-${format}`)
  if(destination==='bigquery')await panel.getByRole('textbox',{name:/^BigQuery service-account JSON/}).fill(JSON.stringify({client_email:'synthetic-cradle-93@example.test',private_key:privateKey}))
  if(destination==='snowflake')await panel.getByRole('textbox',{name:/^Snowflake private key PEM/}).fill(privateKey)
  const saved=page.waitForResponse(response=>response.url().endsWith('/commands/warehouse.save'))
  await panel.getByRole('button',{name:'Save export schedule',exact:true}).click()
  const response=await saved;assert.equal(response.status(),200)
  assert.equal((await response.json()).data.state,'committed')
  await panel.getByRole('status').filter({hasText:'Export schedule saved.'}).waitFor()
  const settings=(await h.request('/api/v1/warehouse-exports')).data.exports.find(item=>item.name===name)
  assert.equal(settings.destination.kind,destination);assert.equal(settings.format,format)
  assert.ok(!JSON.stringify(settings).includes('synthetic-cradle-92')&&!JSON.stringify(settings).includes('PRIVATE KEY'),'Destination credentials are never read back')
  if(destination!=='r2'){
   await panel.getByRole('button',{name:`Edit ${name}`,exact:true}).click()
   if(destination!=='bigquery'){assert.equal(await panel.getByLabel('S3 access key',{exact:true}).inputValue(),'');assert.equal(await panel.getByLabel('S3 secret key',{exact:true}).inputValue(),'')}
   if(destination==='bigquery')assert.equal(await panel.getByRole('textbox',{name:/^BigQuery service-account JSON/}).inputValue(),'')
   if(destination==='snowflake')assert.equal(await panel.getByRole('textbox',{name:/^Snowflake private key PEM/}).inputValue(),'')
   await panel.getByRole('combobox',{name:/^File format/}).selectOption(format==='csv'?'parquet':'csv')
   const edited=page.waitForResponse(result=>result.url().endsWith('/commands/warehouse.save'))
   await panel.getByRole('button',{name:'Save export schedule',exact:true}).click()
   assert.equal((await edited).status(),200,'Editing format retains write-only credentials')
  }
  const current=(await h.request('/api/v1/warehouse-exports')).data.exports.find(item=>item.name===name)
  await h.request('/api/v1/commands/warehouse.remove',{method:'POST',body:{commandId:createUlid(),expected:[],input:{id:current.id,version:current.version}}})
  await page.goto(h.origin+'/app/settings')
 await page.waitForFunction(()=>window.__TSR_ROUTER__?.state.location.pathname==='/app/settings')
  await page.getByText('Scheduled warehouse exports',{exact:true}).click()
 }
}
