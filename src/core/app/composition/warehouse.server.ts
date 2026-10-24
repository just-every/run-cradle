import {Hono} from 'hono'
import type {Platform} from '../../platform'
import type {ServerFoundation} from '../foundation.server'
import type {createRecordsComposition} from './records.server'
import {createRecordsCsv} from '../../../domains/records/csv.server'
import {warehouseConfiguration} from '../../../domains/warehouse/configuration.server'
import {warehouseRuntime} from '../../../domains/warehouse/runtime.server'
import {createUlid} from '../../shared/ids'
import {errorResponse} from '../../registry/errors.server'
export function createWarehouseComposition(platform:Platform,foundation:ServerFoundation,records:ReturnType<typeof createRecordsComposition>,clock=()=>new Date()){
 const configuration=warehouseConfiguration(platform.bindings.DB,foundation,platform.bindings.WAREHOUSE,platform.bindings)
 const runtime=warehouseRuntime(platform.bindings.DB,platform.bindings.WAREHOUSE,foundation,records.services,createRecordsCsv(platform.bindings.DB,records.services,foundation.admission),clock,platform.bindings)
 const http=new Hono()
 http.get('/api/v1/warehouse-exports',async c=>{const id=createUlid();try{const ctx=await foundation.authenticate(c.req.raw,'http',id);return c.json({data:await configuration.read(ctx)},200,{'cache-control':'no-store'})}catch(error){return errorResponse(error,id,'GET /api/v1/warehouse-exports')}})
 return {configuration,runtime,http}
}
