import {randomBytes} from 'node:crypto'
const ALPHABET='0123456789ABCDEFGHJKMNPQRSTVWXYZ'
/** ULIDs made by the agent itself: a millisecond time prefix and 80 random bits. */
export function ulid(){let time=Date.now(),head='';for(let i=0;i<10;i++){head=ALPHABET[time%32]+head;time=Math.floor(time/32)}return head+[...randomBytes(16)].map(b=>ALPHABET[b%32]).join('')}
/** Turn a parsed brief and the base as the key reads it into a complete proposal. */
export function buildProposal(brief,current){
 const tables=structuredClone(current.tables)
 const table=label=>{const found=tables.find(t=>t.label.toLowerCase()===label.toLowerCase());if(!found)throw new Error(`The brief names a table that is neither proposed nor in the base: ${label}`);return found}
 const field=(t,label)=>{const found=t.fields.find(f=>f.label.toLowerCase()===label.toLowerCase());if(!found)throw new Error(`${t.label} has no field ${label}`);return found}
 if(brief.mode==='create'&&tables.length)throw new Error('This key already has a base; use a "Change:" brief.')
 for(const spec of brief.tables)if(!tables.some(t=>t.label.toLowerCase()===spec.label.toLowerCase()))tables.push({id:ulid(),label:spec.label,fields:[]})
 // Scalars and links first, so lookups and labels can refer to them.
 const pending=[]
 for(const spec of brief.tables){
  const t=table(spec.label)
  for(const f of spec.fields){
   if(brief.mode==='change'&&!f.added){field(t,f.label);continue}
   const base={id:ulid(),label:f.label,required:f.required,unique:false}
   if(f.type==='select')t.fields.push({...base,type:'select',options:f.options.map(label=>({id:ulid(),label}))})
   else if(f.type==='relation')t.fields.push({...base,type:'relation',relation:{ownerAppId:current.appId,entityId:table(f.target).id,cardinality:'one',onDelete:'restrict'}})
   else if(f.type==='computed')pending.push([t,f,base])
   else t.fields.push({...base,type:f.type})
   if(f.primary)t.primaryFieldId=base.id
  }
 }
 const lookup=(t,label,via,source)=>{const link=field(t,via);if(link.type!=='relation')throw new Error(`${via} is not a link`);const target=field(tables.find(x=>x.id===link.relation.entityId),source);return {id:ulid(),label,type:'computed',required:false,unique:false,readOnly:true,resultType:target.type,...(target.options?{options:structuredClone(target.options)}:{}),expression:{kind:'rollup',relationFieldId:link.id,valueFieldId:target.id,aggregate:'lookup'}}}
 for(const [t,f,base] of pending){const made={...lookup(t,f.label,f.via,f.source),id:base.id};t.fields.push(made);if(f.primary)t.primaryFieldId=made.id}
 // Every record needs a readable label: a text field, else a lookup of its first link's label, else a date.
 for(const t of tables){
  if(t.primaryFieldId||!t.fields.length)continue
  const text=t.fields.find(f=>f.type==='text')
  const link=t.fields.find(f=>f.type==='relation'),target=link&&tables.find(x=>x.id===link.relation.entityId),targetLabel=target&&(target.fields.find(f=>f.id===target.primaryFieldId)??target.fields.find(f=>f.type==='text'))
  if(text)t.primaryFieldId=text.id
  else if(targetLabel&&['text','date','number','select'].includes(targetLabel.type)){const made=lookup(t,`${link.label} ${targetLabel.label.toLowerCase()}`,link.label,targetLabel.label);t.fields.unshift(made);t.primaryFieldId=made.id}
  else{const date=t.fields.find(f=>f.type==='date');if(date)t.primaryFieldId=date.id}
 }
 // A linked table lists the records that link to it.
 for(const source of tables)for(const link of source.fields.filter(f=>f.type==='relation')){
  const target=tables.find(t=>t.id===link.relation.entityId);target.incomingRelations??=[]
  if(!target.incomingRelations.some(r=>r.sourceFieldId===link.id))target.incomingRelations.push({id:ulid(),label:source.fields.filter(f=>f.type==='relation'&&f.relation.entityId===target.id).length>1?`${source.label} (${link.label})`:source.label,sourceEntityId:source.id,sourceFieldId:link.id})
 }
 const title=t=>t.primaryFieldId??t.fields[0].id
 const views=brief.views.flatMap(v=>{
  if(v.kind==='each-grid')return tables.filter(t=>brief.tables.some(s=>s.label.toLowerCase()===t.label.toLowerCase())).map(t=>({entityId:t.id,name:`All ${t.label.toLowerCase()}`,display:'grid',fields:t.fields.map(f=>f.id),sort:[],groupBy:[],layout:{titleFieldId:title(t)}}))
  const t=table(v.table),f=field(t,v.field)
  if(v.kind==='board')return [{entityId:t.id,name:`${t.label} by ${f.label.toLowerCase()}`,display:'board',fields:t.fields.map(x=>x.id),sort:[],groupBy:[],layout:{titleFieldId:title(t),boardFieldId:f.id}}]
  if(v.kind==='calendar')return [{entityId:t.id,name:`${t.label} calendar`,display:'calendar',fields:t.fields.map(x=>x.id),sort:[{fieldId:f.id,direction:'asc'}],groupBy:[],layout:{titleFieldId:title(t),startFieldId:f.id}}]
  return [{entityId:t.id,name:`${t.label} by ${f.label.toLowerCase()}`,display:'grid',fields:t.fields.map(x=>x.id),sort:[{fieldId:f.id,direction:'asc'}],groupBy:[],layout:{titleFieldId:title(t)}}]
 })
 const forms=brief.forms.map(spec=>{const t=table(spec.table);return {entityId:t.id,title:spec.title??`Add to ${t.label.toLowerCase()}`,fields:t.fields.filter(f=>f.type!=='computed').map(f=>({fieldId:f.id,label:f.label,help:'',required:f.required}))}})
 return {schema:{appId:current.appId,name:current.name??brief.name,tables},views,forms,note:`Proposed from the brief "${brief.name}".`}
}
