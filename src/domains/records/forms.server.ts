import type { CellValue,CommandInput,Json,RevisionRef } from '../../contracts/primitives';
import type { Form } from './contracts';
import type { RequestContext } from '../authority/ports';
import type { AdmissionPlan } from '../admission/ports';
/** Installed by application source, never read from submitted metadata or model SQL. */
export type FormActionMapping={
 appId:string;entityId:string;action:string;fieldIds:readonly string[];
 input:{parse(value:unknown):Json};
 map(input:{form:Form;values:Readonly<Record<string,CellValue>>;expected:readonly RevisionRef[]}):Json;
 prepare(ctx:RequestContext,command:CommandInput<Json>):Promise<AdmissionPlan<unknown>>;
};
export type FormCreatePreparer=(ctx:RequestContext,command:CommandInput<{appId:string;entityId:string;values:Record<string,CellValue>}>)=>Promise<AdmissionPlan<unknown>>;
export function formMappingKey(appId:string,entityId:string,action:string){return appId+':'+entityId+':'+action;}
