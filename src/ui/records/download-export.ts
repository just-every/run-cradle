import {sessionFetch} from '../shared/session-fetch'
export async function downloadExport(url:string,input:unknown,format:'csv'|'xlsx'){
 const response=await sessionFetch(url,{method:'POST',headers:{'content-type':'application/json',accept:format==='csv'?'text/csv':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},body:JSON.stringify(input)})
 if(!response.ok){const body=await response.json().catch(()=>null) as {error?:{message?:string}}|null;throw Error(body?.error?.message??`Export returned ${response.status}.`)}
 const expected=format==='csv'?'text/csv':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
 if(!response.headers.get('content-type')?.startsWith(expected))throw Error('The server returned an invalid export format.')
 const filename=response.headers.get('content-disposition')?.match(/filename\*=UTF-8''(.+)$/i)?.[1]
 if(!filename)throw Error('The export response has no filename.')
 const blob=await response.blob()
 const objectUrl=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=objectUrl;anchor.download=decodeURIComponent(filename);anchor.click();setTimeout(()=>URL.revokeObjectURL(objectUrl),1000)
}
