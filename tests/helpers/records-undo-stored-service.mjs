import './typescript-loader.mjs'
import {loadDescriptorRegistry} from '../../src/domains/records/loader.server.ts'
import {createApplicationEntityRegistry} from '../../src/core/app/composition/entities.server.ts'
import {createPolicyPort} from '../../src/domains/authority/policy.server.ts'
import {createAdmissionService} from '../../src/domains/admission/service.server.ts'
import {createReplayAccess} from '../../src/domains/authority/context.server.ts'
import {createManualSchemas} from '../../src/domains/records/manual/service.server.ts'
import {createBaseImportService} from '../../src/domains/records/base-transfer/service.server.ts'

export async function storedUndoService(db){
 const registry=await loadDescriptorRegistry(db,[]),entities=createApplicationEntityRegistry(registry),policy=createPolicyPort(db,entities),admission=createAdmissionService(db,createReplayAccess(db,policy,entities)),manual=createManualSchemas(db,policy,admission,registry)
 return createBaseImportService(db,policy,registry,manual,()=>{throw new Error('Stored resume must not invoke a parser')})
}
