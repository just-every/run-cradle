import type { RequestContext } from '../../domains/authority/ports';
import type { RepairRepository, Row } from './repository.server';
import { str, json } from './repository.server';
import { REPAIRS_APP_ID, REPAIR_ENTITIES, repairRef } from './model';
import type { Intake } from './contracts';
function intakeDTO(row:Row):Intake{return {id:row.id,version:row.version,createdAt:row.created_at,updatedAt:row.updated_at,appId:REPAIRS_APP_ID,sourceIds:json(row,'source_ids'),state:row.lifecycle as Intake['state'],claimIds:[],candidates:json(row,'candidates'),exactIdentity:row.asset_id?repairRef('assets',str(row,'asset_id')):null,duplicateOf:null,caseId:row.case_id as string|null,question:row.question?json(row,'question'):null,failure:null};}

/** Cached suggestions are hints: current linked-row and name authority determine disclosure. */
export async function projectIntake(ctx: RequestContext, repo: RepairRepository, row: Row): Promise<Intake> {
 const value=intakeDTO(row), candidates:Intake['candidates']=[];
 async function currentAsset(ref: {appId:string;entityId:string;recordId:string}) {
  if(ref.appId!==REPAIRS_APP_ID||ref.entityId!==REPAIR_ENTITIES.assets)return null;
  try{return await repo.load(ctx,'assets',ref.recordId,['name']);}
  catch(error){if(error && typeof error==='object' && 'code' in error && ['forbidden','not_found'].includes(String(error.code)))return null;throw error;}
 }
 for(const candidate of value.candidates){const asset=await currentAsset(candidate.ref);if(asset)candidates.push({ref:repairRef('assets',asset.id),reasons:[str(asset,'name')]});}
 const identity=value.exactIdentity?await currentAsset(value.exactIdentity):null;
 return {...value,candidates,exactIdentity:identity?repairRef('assets',identity.id):null};
}
