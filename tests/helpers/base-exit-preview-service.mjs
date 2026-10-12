import {loadDescriptorRegistry} from '../../src/domains/records/loader.server.ts'
import {createApplicationEntityRegistry} from '../../src/core/app/composition/entities.server.ts'
import {createPolicyPort} from '../../src/domains/authority/policy.server.ts'
import {createBaseImportService} from '../../src/domains/records/base-transfer/service.server.ts'
import {createJsonIdentityPreflight} from '../../src/domains/records/base-transfer/json-identities.server.ts'
/** Production upload planning and identity collision checks, with real read-only D1. */
export async function exitPreviewService(db,builder){
 const registry=await loadDescriptorRegistry(db,[]),policy=createPolicyPort(db,createApplicationEntityRegistry(registry))
 return {service:createBaseImportService(db,policy,registry,undefined,builder),identities:createJsonIdentityPreflight(db,registry)}
}
