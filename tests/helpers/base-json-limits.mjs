const id=n=>String(n).padStart(26,'0')
/** Distinct source IDs keep capacity cases independent of duplicate-ID refusal. */
export function jsonLimitCase(kind,count){
 const snapshot={format:'cradle-base',version:1,envelope:{capturedAt:'2026-10-08T00:00:00.000Z'},base:{id:id(1),name:'Limit case',tables:[],views:[],forms:[]}}
 for(let t=0;t<(kind==='tables'?count:1);t++){
  const fields=Array.from({length:kind==='fields'?count:1},(_,n)=>({id:id(1000+t*100+n),label:'Field '+n,type:'text',required:false,unique:false})),records=Array.from({length:kind==='records'?count:kind==='tableBytes'?110:1},(_,n)=>({id:id(20000+t*20000+n),values:Object.fromEntries(fields.map(field=>[field.id,kind==='cell'? 'x'.repeat(count):kind==='tableBytes'?'x'.repeat(100000):'Value']))}))
  snapshot.base.tables.push({id:id(10+t),label:'Table '+t,primaryFieldId:fields[0].id,fields,incomingRelations:[],records})
 }
 return snapshot
}
export function oversizedMultipart(origin,cookie,csrf){
 const maximum=20*10485760+1048576,boundary='cradle-actual-stream-limit',encoder=new TextEncoder(),prefix=encoder.encode(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="base.json"\r\nContent-Type: application/json\r\n\r\n`),chunk=encoder.encode(' '.repeat(65536));let sent=0,started=false
 const body=new ReadableStream({pull(controller){if(!started){started=true;sent+=prefix.byteLength;controller.enqueue(prefix);return}if(sent<=maximum){sent+=chunk.byteLength;controller.enqueue(chunk);return}controller.close()}})
 return {request:new Request(origin+'/api/v1/records/base-import/preview',{method:'POST',headers:{origin,cookie,'x-csrf-token':csrf,'content-type':`multipart/form-data; boundary=${boundary}`},body,duplex:'half'}),sent:()=>sent,maximum}
}
