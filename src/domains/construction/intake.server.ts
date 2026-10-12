import type { PolicyPort,RequestContext } from '../authority/ports';
import type { AdmissionPlan } from '../admission/ports';
import type { EntityDescriptor } from '../records/descriptors.server';
import { registerTable } from '../admission/sql.server';
import type { RevisionRef } from '../../contracts/primitives';
import { canonical,digest,stableId } from './source';
export const sourceIntakeEntityId='00000000000000000000001070',sourceIntakeFilesFieldId='00000000000000000000001071',sourceIntakeOwnerFieldId='00000000000000000000001072';
const table=registerTable('construction_source_intakes',['id','app_id','owner_id','version','created_at','updated_at','lifecycle','schema_version']),files=registerTable('construction_source_intake_files',['id','record_id','value','position']);
export function sourceIntakeDescriptor(installationAppId:string):EntityDescriptor {
 const attachment={id:sourceIntakeFilesFieldId,label:'Permitted source files',type:'attachment' as const,required:false,unique:false},owner={id:sourceIntakeOwnerFieldId,label:'Owner',type:'text' as const,required:true,unique:false,readOnly:true};
 return{schema:{id:sourceIntakeEntityId,appId:installationAppId,label:'Source preparation',version:1,createdAt:'1970-01-01T00:00:00.000Z',updatedAt:'1970-01-01T00:00:00.000Z',physicalRevision:'construction-source-intake-v1',fields:[attachment,owner],lifecycle:{states:['preparing'],initial:'preparing',transitions:[]}},table,fields:new Map([[attachment.id,{field:attachment,column:'files',join:{table:files,valueColumn:'value'}}],[owner.id,{field:owner,column:'owner_id'}]]),idColumn:'id',versionColumn:'version',createdColumn:'created_at',updatedColumn:'updated_at',lifecycleColumn:'lifecycle',schemaVersionColumn:'schema_version',writePolicy:{create:false,patch:true,delete:false,protectedFieldIds:[sourceIntakeOwnerFieldId]}};
}
export class SourceIntake {
 constructor(readonly policy:PolicyPort,readonly installationAppId:string){}
 async prepare(ctx:RequestContext,commandId:string):Promise<AdmissionPlan<{subject:RevisionRef;fieldIds:string[]}>>{
  if(ctx.principal.kind!=='human'||!ctx.principal.sessionId)throw new Error('source_intake_requires_human');
  const action='source.intake.prepare',inputHash=await digest(canonical({ownerId:ctx.principal.id})),permit=await this.policy.authorize(ctx,{appId:this.installationAppId,action,expected:[],targetEntityId:sourceIntakeEntityId,cost:[],inputHash,commandId});
  const id=await stableId({commandId,ownerId:ctx.principal.id,kind:'source-intake'}),subject={ref:{appId:this.installationAppId,entityId:sourceIntakeEntityId,recordId:id},version:1};
  return{commandId,action,appId:this.installationAppId,canonicalInputHash:inputHash,permit,guards:[],mutations:[{kind:'insert',table,row:{id,app_id:this.installationAppId,owner_id:ctx.principal.id,version:1,created_at:ctx.now,updated_at:ctx.now,lifecycle:'preparing',schema_version:1}}],audit:[{action,subject:subject.ref,changes:[],sourceIds:[],personalContentRefs:[id]}],events:[],outbox:[],committedResult:{subject,fieldIds:[sourceIntakeFilesFieldId]}};
 }
}

export const sourceIntakePolicyEntity:import('../authority/scope.server').PolicyEntity={id:sourceIntakeEntityId,table:'construction_source_intakes',idColumn:'id',appColumn:'app_id',fields:[{id:sourceIntakeOwnerFieldId,column:'owner_id',type:'text',nullable:false},{id:sourceIntakeFilesFieldId,column:'id',type:'opaque',nullable:false}]};
