import {useState} from 'react'
import type {InterfaceDefinition} from '../../../domains/records/interfaces/contracts'
import type {EntitySchema,View} from '../../../domains/records/contracts'
import {useResource} from '../../shared/api'
import {ResourceState} from '../../shared/presentation'
import {RecordForm} from '../record-form'
import {SavedViewResult} from '../saved-views'
import {GridHistoryProvider} from '../grid-history'

type Component=InterfaceDefinition['pages'][number]['sections'][number]['components'][number]
function BoundView({viewId,readOnly}:{viewId:string;readOnly?:boolean}){
 const view=useResource<View>(`/api/v1/views/${viewId}`)
 return <ResourceState resource={view.resource} operation="interface records" retry={view.refresh}>{value=><ViewBody view={value} readOnly={readOnly}/>}</ResourceState>
}
function ViewBody({view,readOnly}:{view:View;readOnly?:boolean}){
 const schema=useResource<EntitySchema>(`/api/v1/apps/${view.appId}/entities/${view.entityId}`)
 return <ResourceState resource={schema.resource} operation="interface table" retry={schema.refresh}>{value=><GridHistoryProvider schema={value}><SavedViewResult view={view} schema={readOnly?{...value,fields:value.fields.map(field=>({...field,readOnly:true}))}:value}/></GridHistoryProvider>}</ResourceState>
}
function Content({component,readOnly}:{component:Component;readOnly?:boolean}){
 if(component.kind==='view')return <BoundView viewId={component.viewId} readOnly={readOnly}/>
 if(component.kind==='form')return readOnly?<p>Authenticated form. Open the current version to submit.</p>:<RecordForm formId={component.formId}/>
 if(component.kind==='text')return <p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{component.text}</p>
 return <hr/>
}
export function InterfaceCanvas({definition,readOnly}:{definition:InterfaceDefinition;readOnly?:boolean}){
 const [selected,setSelected]=useState(definition.pages[0]?.id),[tab,setTab]=useState<string|null>(null)
 const page=definition.pages.find(page=>page.id===selected)??definition.pages[0]
 if(!page)return <p>No pages have been published.</p>
 const tabs=[...new Set(page.sections.map(section=>section.tab).filter(Boolean))],active=tab&&tabs.includes(tab)?tab:tabs[0]??''
 return <section className="cr-stack" aria-label="Published interface"><nav className="cr-tabs" style={{flexWrap:'wrap'}} aria-label="Interface pages">{definition.pages.map(page=><button type="button" className="cr-tab" key={page.id} aria-pressed={page.id===selected} onClick={()=>{setSelected(page.id);setTab(null)}}>{page.title}</button>)}</nav><h2>{page.title}</h2>{tabs.length>0&&<nav className="cr-tabs" style={{flexWrap:'wrap'}} aria-label="Page tabs">{tabs.map(value=><button key={value} type="button" className="cr-tab" aria-pressed={active===value} onClick={()=>setTab(value)}>{value}</button>)}</nav>}{page.sections.filter(section=>!section.tab||section.tab===active).map(section=><section className="cr-card cr-stack" key={section.id} aria-label={section.title}><h3>{section.title}</h3>{section.components.map(component=><div key={component.id}><Content component={component} readOnly={readOnly}/></div>)}</section>)}</section>
}
