import type { SchemaDraft } from '../../../domains/records/manual/contracts'
import { newField as field,templateFields } from './template-fields'
export function contentTables(appId:string):SchemaDraft['tables']{
 const {table,select,link,lookup}=templateFields(appId)
 const campaigns=table('Campaigns',[field('Campaign'),field('Owner','person'),field('Start date','date'),field('End date','date'),field('Budget','money'),field('Brief')])
 const campaign=link('Campaign',campaigns)
 const content=table('Content',[field('Content item'),campaign,select('Format',['Article','Email','Video','Social','Podcast']),select('Status',['Idea','Drafting','Review','Approved','Published']),field('Author','person'),field('Publish date','date'),field('Draft URL','url'),field('Published URL','url'),lookup('Campaign brief',campaign,campaigns.fields[5]!)])
 const item=link('Content item',content)
 return [campaigns,content,table('Production tasks',[field('Task'),item,field('Assignee','person'),field('Due date','date'),field('Complete','boolean'),field('Notes')])]
}
