import { canonical, digest } from './source';
export type ArtifactReference={id:string;sha256:string;downloadUrl:string};
export type RunnerJob={jobId:string;kind:'build'|'evaluate'|'optimize';sourceArtifact:ArtifactReference;inputArtifact:ArtifactReference;networkAllowlist:string[];limits:{cpuSeconds:number;memoryBytes:number;wallSeconds:number};outputSchemaHash:string};
export type RunnerPayload={jobId:string;state:'queued'|'running'|'succeeded'|'failed'|'cancelled'|'erased';sourceHash?:string;inputHash?:string;outputSchemaHash?:string;artifacts:{id:string;sha256:string;bytes:number}[];exitCode?:number;error?:string;issuedAt:string};
export type Signed<T>={payload:T;signature:string};
function decode(base64:string){return Uint8Array.from(atob(base64),c=>c.charCodeAt(0));}
export class RunnerClient {
 constructor(readonly config:{url:string;token:string;publicKey:string;deployToken?:string;allowLocalDevelopment?:boolean}){if(!config.url||!config.token||!config.publicKey)throw new Error('candidate_runner_unconfigured');const u=new URL(config.url);if(u.protocol!=='https:'&&!(config.allowLocalDevelopment&&u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))throw new Error('runner_requires_https');}
 async verify<T>(envelope:Signed<T>):Promise<T>{
  const keyBytes=decode(this.config.publicKey.replace(/-----[^-]+-----|\s/g,''));
  const key=await crypto.subtle.importKey('spki',keyBytes,{name:'Ed25519'},false,['verify']);
  if(!await crypto.subtle.verify('Ed25519',key,decode(envelope.signature),new TextEncoder().encode(canonical(envelope.payload))))throw new Error('runner_signature_invalid');
  return envelope.payload;
 }
 async transport(method:string,path:string,value?:unknown,deployment=false,maximum=16*1024*1024):Promise<Uint8Array>{
  const body=value instanceof Uint8Array?new Uint8Array(value):value===undefined?'':canonical(value),timestamp=String(Date.now()),nonce=crypto.randomUUID().replaceAll('-','');
  const token=deployment?this.config.deployToken:this.config.token;if(!token)throw new Error('deployment_unconfigured');
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(token),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode([method,path,timestamp,nonce,await digest(body)].join('\n'))))).map(b=>b.toString(16).padStart(2,'0')).join('');
  const response=await fetch(new URL(path,this.config.url),{method,headers:{'Content-Type':'application/json','X-Cradle-Timestamp':timestamp,'X-Cradle-Nonce':nonce,'X-Cradle-Signature':signature},body:body||undefined,redirect:'error',signal:AbortSignal.timeout(30_000)});
  if(!response.ok)throw new Error(`runner_http_${response.status}`);
  if(!response.body)throw new Error('runner_empty_response');
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>maximum)throw new Error('runner_response_too_large');chunks.push(next.value);}}finally{await reader.cancel();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
 }
 async request<T>(method:string,path:string,value?:unknown,deployment=false):Promise<Signed<T>>{
  const bytes=await this.transport(method,path,value,deployment,1_048_576);
  const envelope=JSON.parse(new TextDecoder().decode(bytes)) as Signed<T>;await this.verify(envelope);return envelope;
 }
 async artifact(sha256:string):Promise<Uint8Array>{if(!/^[a-f0-9]{64}$/.test(sha256))throw new Error('invalid_artifact_hash');const bytes=await this.transport('GET',`/artifacts/${sha256}`);if(await digest(bytes)!==sha256)throw new Error('artifact_hash_mismatch');return bytes;}
 async upload(bytes:Uint8Array):Promise<ArtifactReference>{const sha256=await digest(bytes),result=await this.request<ArtifactReference>('PUT',`/artifacts/${sha256}`,bytes);if(result.payload.sha256!==sha256||result.payload.downloadUrl!==`runner:${sha256}`)throw new Error('uploaded_artifact_mismatch');return result.payload;}
 async submit(job:RunnerJob){const result=await this.request<RunnerPayload>('POST','/jobs',job);if(result.payload.jobId!==job.jobId)throw new Error('runner_job_mismatch');return result;}
 async status(id:string){if(!/^[a-zA-Z0-9_-]{8,80}$/.test(id))throw new Error('invalid_job_id');const result=await this.request<RunnerPayload>('GET',`/jobs/${id}`);if(result.payload.jobId!==id)throw new Error('runner_job_mismatch');return result;}
 async cancel(id:string){if(!/^[a-zA-Z0-9_-]{8,80}$/.test(id))throw new Error('invalid_job_id');return this.request<RunnerPayload>('POST',`/jobs/${id}/cancel`,{});}
 async execute(job:RunnerJob,signal?:AbortSignal):Promise<Signed<RunnerPayload>>{
  let result=await this.submit(job);const deadline=Date.now()+(job.limits.wallSeconds+60)*1000;
  while(['queued','running'].includes(result.payload.state)){
   if(signal?.aborted||Date.now()>deadline){await this.cancel(job.jobId);throw new Error(signal?.aborted?'runner_cancelled':'runner_deadline');}
   await new Promise(resolve=>setTimeout(resolve,250));result=await this.status(job.jobId);
  }
  if(result.payload.state!=='succeeded')throw new Error(result.payload.error??`runner_${result.payload.state}`);
  if(result.payload.sourceHash!==job.sourceArtifact.sha256||result.payload.inputHash!==job.inputArtifact.sha256||result.payload.outputSchemaHash!==job.outputSchemaHash||result.payload.exitCode!==0)throw new Error('runner_result_identity_mismatch');
  return result;
 }
}
