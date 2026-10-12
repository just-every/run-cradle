import type { RequestContext } from '../authority/ports';
import type { ConstructionRepository } from './repository.server';
import type { RunnerClient } from './runner-client.server';
export class CandidatePreview {
 constructor(readonly candidates:ConstructionRepository,readonly runner:RunnerClient){}
 async html(ctx:RequestContext,id:string){
  const detail=await this.candidates.get(ctx,id);
  if(detail.build?.state!=='succeeded'||detail.build.sourceHash!==detail.source.sha256||detail.candidate.state==='rejected')throw new Error('preview_unavailable');
  const bytes=await this.runner.artifact(detail.build.artifactHash);
  const bundle=JSON.parse(new TextDecoder().decode(bytes)) as {files:{path:string;content:string}[]};
  const file=bundle.files.find(f=>f.path==='public/index.html');if(!file)throw new Error('preview_screen_missing');
  const html=Uint8Array.from(atob(file.content),c=>c.charCodeAt(0));
  return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','Content-Security-Policy':"sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'",'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
 }
}
