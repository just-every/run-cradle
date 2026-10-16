import { createUlid } from '../../../core/shared/ids'
import type { SchemaDraft } from '../../../domains/records/manual/contracts'
import type { Field } from '../../../domains/records/contracts'
export const templates=[{id:'crm',name:'Customer relationships',description:'Companies, contacts and deals, with linked company names and a sales pipeline.'},{id:'launch',name:'Launch readiness',description:'Campaigns, deliverables and risks. Track dates, completion and readiness without AI.'},{id:'projects',name:'Project tracker',description:'Projects and tasks, with priorities, due dates and linked project names.'}]
export function newField(label='Name',type:Field['type']='text'):Field{return {id:createUlid(),label,type,required:false,unique:false}}
export function blankBase():SchemaDraft{return {appId:createUlid(),name:'',tables:[{id:createUlid(),label:'Table 1',fields:[newField()]}]}}
export function templateBase(key:string):SchemaDraft{
 const draft=blankBase(),table=(label:string,fields:Field[])=>({id:createUlid(),label,fields}),select=(label:string,options:string[]):Field=>({...newField(label,'select'),options:options.map(label=>({id:createUlid(),label}))}),link=(label:string,target:SchemaDraft['tables'][number]):Field=>({...newField(label,'relation'),relation:{ownerAppId:draft.appId,entityId:target.id,cardinality:'one',onDelete:'restrict'}})
 const lookup=(label:string,relation:Field,target:Field):Field=>({...newField(label,'computed'),readOnly:true,resultType:target.type,expression:{kind:'rollup',relationFieldId:relation.id,valueFieldId:target.id,aggregate:'lookup'}})
 if(key==='crm'){
  const companies=table('Companies',[newField('Company'),newField('Website','url'),newField('Renewal date','date')]),company=link('Company',companies)
  const contacts=table('Contacts',[newField('Contact'),newField('Email'),company,lookup('Company name',company,companies.fields[0]!)])
  const dealCompany=link('Company',companies),contact=link('Contact',contacts)
  draft.name='Customer relationships';draft.tables=[companies,contacts,table('Deals',[newField('Deal'),newField('Value','number'),select('Stage',['New','Qualified','Won','Lost']),newField('Close date','date'),newField('Approved','boolean'),dealCompany,contact,lookup('Company name',dealCompany,companies.fields[0]!)])]
 }else if(key==='projects'){
  const projects=table('Projects',[newField('Project'),newField('Target date','date'),newField('Budget','number')]),project=link('Project',projects)
  draft.name='Project tracker';draft.tables=[projects,table('Tasks',[newField('Task'),select('Priority',['Low','Medium','High']),newField('Due date','date'),newField('Complete','boolean'),project,lookup('Project name',project,projects.fields[0]!)])]
 }else throw new Error('Unknown template')
 return draft
}
