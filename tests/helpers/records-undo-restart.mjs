import './typescript-loader.mjs'
import {readFile,writeFile} from 'node:fs/promises'
import {undoSqlite} from './records-undo-harness.mjs'
import {loadDescriptorRegistry} from '../../src/domains/records/loader.server.ts'
import {createApplicationEntityRegistry} from '../../src/core/app/composition/entities.server.ts'
import {createPolicyPort} from '../../src/domains/authority/policy.server.ts'
import {createAdmissionService} from '../../src/domains/admission/service.server.ts'
import {createReplayAccess} from '../../src/domains/authority/context.server.ts'
import {createManualSchemas} from '../../src/domains/records/manual/service.server.ts'
import {createBaseImportService} from '../../src/domains/records/base-transfer/service.server.ts'
import {baseImportHttp} from '../../src/domains/records/base-transfer/http.server.ts'
import {prepareCsvSource,allocateImportIdentities} from '../../src/domains/records/base-transfer/source.ts'

const [filename,input,output]=process.argv.slice(2),storage=undoSqlite(filename,false)
try{
 const {ctx,jobId}=JSON.parse(await readFile(input,'utf8')),registry=await loadDescriptorRegistry(storage.db,[]),entities=createApplicationEntityRegistry(registry),policy=createPolicyPort(storage.db,entities),admission=createAdmissionService(storage.db,createReplayAccess(storage.db,policy,entities)),manual=createManualSchemas(storage.db,policy,admission,registry),service=createBaseImportService(storage.db,policy,registry,manual,()=>{throw new Error('Stored resume must not invoke a parser')})
 let status=await service.status(ctx,jobId),batches=0
 while(status.job.state==='undoing'&&batches++<1000){await service.undo(ctx,jobId);status=await service.status(ctx,jobId)}
 const authenticate=async()=>ctx,http=baseImportHttp(service,{prepare:prepareCsvSource,identities:allocateImportIdentities},authenticate,authenticate),download=await http.request('http://localhost/api/v1/records/base-import/jobs/'+jobId+'/report.json')
 if(download.status!==200)throw new Error('Stored report download failed '+download.status)
 await writeFile(output,JSON.stringify({status,download:await download.json(),originals:await service.originals(ctx,jobId),batches}))
}finally{storage.close()}
