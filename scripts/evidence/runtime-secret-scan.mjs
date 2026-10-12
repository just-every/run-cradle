import assert from 'node:assert/strict'
import {readFile,readdir,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
/** Scan only this lane's evidence; report counts, never values. */
export async function scanEvidence(directory,values,issuedValues=[],publicResponses=[],capturedLogs=[],archiveContents=[]){
 const candidates=Object.entries(values).filter(([key,value])=>/(SECRET|TOKEN|KEY|PASSWORD)/.test(key)&&typeof value==='string'&&value.length>=16).map(([,value])=>value)
 candidates.push(...issuedValues.filter(value=>typeof value==='string'&&value.length>=16))
 const secrets=[...new Set(candidates)]
 const prefix=process.env.CRADLE_EVIDENCE_PREFIX??''
 const files=(await readdir(directory)).filter(name=>name.startsWith(prefix)&&/^(runtime-|execution-|base-adoption-)/.test(name.slice(prefix.length))&&/\.(log|json|md|txt)$/.test(name))
 let matches=0
 for(const name of files){const file=join(directory,name),body=await readFile(file,'utf8');let redacted=body;for(const value of secrets){matches+=redacted.split(value).length-1;redacted=redacted.replaceAll(value,'[REDACTED_GENERATED_SECRET]')}if(redacted!==body)await writeFile(file,redacted)}
 let remaining=0
 for(const name of files){const body=await readFile(join(directory,name),'utf8');for(const value of secrets)remaining+=body.split(value).length-1}
 const publicResponseMatches=publicResponses.reduce((count,body)=>count+secrets.reduce((total,value)=>total+body.split(value).length-1,0),0)
 const logCounts=capturedLogs.map(({kind,body})=>({kind,bytes:Buffer.byteLength(body),exactValueMatchesBeforeRedaction:secrets.reduce((count,value)=>count+body.split(value).length-1,0)}))
 const rawCapturedLogMatches=logCounts.reduce((count,row)=>count+row.exactValueMatchesBeforeRedaction,0)
 const archiveMatches=archiveContents.reduce((count,body)=>count+secrets.reduce((total,value)=>total+body.split(value).length-1,0),0)
 const result={archiveMatches,archiveSegmentsChecked:archiveContents.length,archiveBytesChecked:archiveContents.reduce((count,body)=>count+Buffer.byteLength(body),0),rawCapturedLogMatches,capturedLogs:logCounts,excludedPrivateIssuance:'Authenticated csrf and session issuance responses, owner-only outbox magic links and Set-Cookie headers; their actual values are collected in memory to check public bodies and logs.',publicResponseMatches,generatedPrivateValuesChecked:secrets.length,evidenceFilesChecked:files.length,exactValueMatchesBeforeRedaction:matches,exactValueMatchesAfterRedaction:remaining,redacted:remaining===0}
 await writeFile(join(directory,prefix+'runtime-secret-scan.json'),JSON.stringify(result,null,2)+'\n');assert.equal(remaining,0);assert.equal(archiveMatches,0,'Actual setup and issued private values must not occur in the installation archive or its decoded binary content');assert.equal(rawCapturedLogMatches,0,'Generated and issued private values must not occur in raw captured CLI or Worker logs');assert.equal(publicResponseMatches,0,'Issued private values must not occur in signed-out public responses')
 return result
}
