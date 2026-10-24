import {Hono} from 'hono';
import {errorResponse} from '../../core/registry/errors.server';
import {createUlid} from '../../core/shared/ids';
import type {RequestContext} from '../authority/ports';
import type {EvidencePort} from '../evidence/ports';
import type {DescriptorRegistry} from '../records/descriptors.server';
import {createOperationsProjection} from './environment.server';
import {OperationsRepository} from './repository.server';
import {createOperationsRoutes} from './routes.server';
/** Your operations' door: the cases and operating instructions the included apps record, read through current policy
 * from the same store the Repairs app writes. No operations service is composed, so its commands answer unconfigured.
 * The application reaches it through fetch, so the application's onError never sees its errors; it answers them as the
 * other doors do: a missing, expired or revoked session 401, a missing CSRF token 403, never a bare 500. */
export function createOperationsDoor(d:{db:D1Database;policy:import('../authority/ports').PolicyPort;evidence:Pick<EvidencePort,'source'>;descriptors:DescriptorRegistry;cursorSecret:string;authenticate:(request:Request)=>Promise<RequestContext>}){
 const reads=new OperationsRepository({db:d.db,policy:d.policy,environment:{project:createOperationsProjection(d)}});
 return new Hono().onError((error,c)=>errorResponse(error,createUlid(),`${c.req.method} ${c.req.path}`)).route('/api/v1',createOperationsRoutes({reads,cursorSecret:d.cursorSecret,authenticate:d.authenticate}));
}
