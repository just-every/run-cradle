import {sessionFetch} from '../shared/session-fetch'
export async function downloadExport(url:string,input:unknown,format:'csv'|'xlsx'){
 const response=await sessionFetch(url,{method:'POST',headers:{'content-type':'application/json',accept:format==='csv'?'text/csv':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},body:JSON.stringify(input)})
 if(!response.ok){const body=await response.json().catch(()=>null) as {error?:{message?:string}}|null;throw Error(body?.error?.message??`Export returned ${response.status}.`)}
 const blob=await response.blob(),filename=response.headers.get('content-disposition')?.match(/filename\*=UTF-8''(.+)$/i)?.[1]
 const objectUrl=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=objectUrl;anchor.download=filename?decodeURIComponent(filename):'records.'+format;anchor.click();setTimeout(()=>URL.revokeObjectURL(objectUrl),1000)
}
