import type { PolicyPort, RequestContext } from '../authority/ports';
import type { AdmissionPort } from '../admission/ports';
import { ConstructionRepository } from './repository.server';
import { ConstructionJobs } from './jobs.server';
import { SourceIntake } from './intake.server';
import { constructionReadiness } from './readiness.server';
import { createConstructionRoutes } from './http.server';
/** App studio's door as this product composes it: real candidate, evaluation and job reads and the installation's
 * readiness. It composes no construction model, so no job handler exists and every construction command answers
 * unconfigured, naming what the installation is missing. */
export function createConstructionDoor(d:{db:D1Database;policy:PolicyPort;admission:AdmissionPort;installationAppId:string;runner:boolean;authenticate(request:Request,ingress:RequestContext['ingress'],requestId:string):Promise<RequestContext>}){
 return createConstructionRoutes({authenticate:d.authenticate,readiness:constructionReadiness({policy:d.policy,installationAppId:d.installationAppId,runner:d.runner}),repository:new ConstructionRepository(d.db,d.policy,d.admission),jobs:new ConstructionJobs(d.db,d.policy,d.admission,new Map()),intake:new SourceIntake(d.policy,d.installationAppId),admission:d.admission});
}
