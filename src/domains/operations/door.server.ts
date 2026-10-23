import {Hono} from 'hono';
import type {RequestContext} from '../authority/ports';
import type {EvidencePort} from '../evidence/ports';
import type {DescriptorRegistry} from '../records/descriptors.server';
import {createOperationsProjection} from './environment.server';
import {OperationsRepository} from './repository.server';
import {createOperationsRoutes} from './routes.server';
/** Your operations' door: the cases and operating instructions the included apps record, read through current policy
 * from the same store the Repairs app writes. No operations service is composed, so its commands answer unconfigured. */
export function createOperationsDoor(d:{db:D1Database;policy:import('../authority/ports').PolicyPort;evidence:Pick<EvidencePort,'source'>;descriptors:DescriptorRegistry;cursorSecret:string;authenticate:(request:Request)=>Promise<RequestContext>}){
 const reads=new OperationsRepository({db:d.db,policy:d.policy,environment:{project:createOperationsProjection(d)}});
 return new Hono().route('/api/v1',createOperationsRoutes({reads,cursorSecret:d.cursorSecret,authenticate:d.authenticate}));
}
