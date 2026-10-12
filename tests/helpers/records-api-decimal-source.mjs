import {prepareApiSource} from '../../src/domains/records/base-transfer/source-api.ts'
export const decimalMetadata='{"tables":[{"id":"table","name":"Decimals","primaryFieldId":"name","fields":[{"id":"name","name":"Name","type":"singleLineText"},{"id":"amount","name":"Amount","type":"number"}]}]}'
/** Recorded literal UTF-8 bodies: no JS numeric value is serialized en route. */
export async function decimalSource(pages,{metadata=decimalMetadata,chunkSize=7}={}){
 const calls=[],bodies=[metadata,...pages]
 const source=await prepareApiSource({metadataUrl:'https://recorded.example/meta',recordsUrl:()=> 'https://recorded.example/rows'},async request=>{
  calls.push(request.url)
  const body=bodies[calls.length-1];if(body===undefined)throw new Error('Unexpected recorded transport request')
  const bytes=new TextEncoder().encode(body)
  return new Response(new ReadableStream({start(controller){for(let i=0;i<bytes.length;i+=chunkSize)controller.enqueue(bytes.slice(i,i+chunkSize));controller.close()}}))
 })
 return {source,calls,bodies}
}
export const decimalRows=tokens=>'{'+'"records":['+tokens.map((token,index)=>`{"id":"r${index}","fields":{"Name":"Row ${index}","Amount":${token}}}`).join(',')+']}'
