import assert from 'node:assert/strict'
import {createRedaction} from '../base-onboarding/redaction.mjs'

/** Preserve raw streams in memory; parse complete JSON lines separately. */
export function observeChild(child){
 const events=[],streams={stdout:'',stderr:''},pending={stdout:'',stderr:''}
 let drained=false,spawnError
 const parse=line=>{try{events.push(JSON.parse(line))}catch{}}
 for(const name of ['stdout','stderr']){
  child[name].setEncoding('utf8')
  child[name].on('data',text=>{
   streams[name]+=text;pending[name]+=text
   let newline
   while((newline=pending[name].indexOf('\n'))>=0){parse(pending[name].slice(0,newline));pending[name]=pending[name].slice(newline+1)}
  })
 }
 child.once('error',error=>{spawnError=error})
 const close=new Promise(resolve=>child.once('close',(code,signal)=>{
  for(const name of ['stdout','stderr'])if(pending[name])parse(pending[name])
  drained=true;resolve({code,signal})
 }))
 return {events,streams,close,get drained(){return drained},get spawnError(){return spawnError},output:()=>streams.stdout+streams.stderr}
}

/** Only drained, Base-redacted diagnostics may leave the in-memory capture. */
export function childDiagnostic(phase,child,capture,knownValues=[]){
 assert.ok(capture.drained,'Child close must drain stdout/stderr before diagnostics')
 const known=[...new Set(knownValues.filter(value=>typeof value==='string'&&value.length))]
 const redactor=createRedaction();redactor.addSecrets(known)
 const errors=capture.events.filter(event=>event.event==='error').map(event=>{
  const raw=String(event.message??''),message=redactor.redact(raw)
  const matches=known.reduce((count,value)=>count+raw.split(value).length-1,0)
  assert.ok(!known.some(value=>message.includes(value)),'Actual setup/issued values remain in diagnostic')
  return {code:/^[a-z][a-z_-]{0,63}$/.test(event.code??'')?event.code:'withheld',message,knownValueMatchesBeforeRedaction:matches}
 })
 return {phase,childClosed:true,exitCode:child.exitCode,outputBytes:Buffer.byteLength(capture.output()),structuredErrorCount:errors.length,errors,structuredReadyCount:capture.events.filter(event=>event.event==='ready').length,rawOutputWithheld:true}
}
