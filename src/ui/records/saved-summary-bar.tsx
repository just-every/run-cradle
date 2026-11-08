import {SavedGroupCounts} from './saved-group-counts'
import {useEffect,useRef,useState} from 'react'
import type {EntitySchema,View} from '../../domains/records/contracts'
import {readViewSummary,type ViewSummarySnapshot} from './view-summary-query'
import {summaryMethods} from './view-presentation-editor'
import {Timestamp} from '../shared/presentation'
export function SavedSummaryBar({view,schema,revision}:{view:View;schema:EntitySchema;revision?:number}){
 const [state,setState]=useState<{identity:string;snapshot?:ViewSummarySnapshot;error?:string;loading?:boolean}>({identity:''}),controller=useRef<AbortController|null>(null)
 const identity=JSON.stringify({view,schema,revision})
 async function calculate(){controller.current?.abort();const abort=new AbortController();controller.current=abort;setState({identity,loading:true});try{const snapshot=await readViewSummary({schema,query:{limit:200,groupBy:view.groupBy},fields:(view.summaries??[]).map(item=>item.fieldId),viewId:view.id},abort.signal);if(!abort.signal.aborted)setState({identity,snapshot})}catch(error){if(!abort.signal.aborted)setState({identity,error:error instanceof Error?error.message:'Summary could not be read.'})}}
 useEffect(()=>{void calculate();return()=>controller.current?.abort()},[identity])
 useEffect(()=>{const changed=()=>{controller.current?.abort();setState({identity,error:'Records changed. Refresh the summary to calculate current totals.'})};window.addEventListener('records-changed',changed);return()=>window.removeEventListener('records-changed',changed)},[])
 const current=state.identity===identity?state:{identity,loading:true,snapshot:undefined,error:undefined}
 return <section className="cr-stack" aria-label="Saved view summaries"><div className="cr-actions"><h3>Summary bar</h3><button type="button" className="cr-button cr-button--quiet" disabled={current.loading} onClick={()=>void calculate()}>Refresh summaries</button></div>{current.loading&&<p role="status">Calculating every matching page…</p>}{current.error&&<p role="alert">{current.error}</p>}{current.snapshot&&<><p>{current.snapshot.total} matching records · <Timestamp value={current.snapshot.evaluatedAt} /></p><dl className="cr-view-summary-bar">{view.summaries?.map(item=>{const field=schema.fields.find(f=>f.id===item.fieldId);if(!field)return null;const result=current.snapshot!.aggregates[field.id]![item.aggregate];return <div key={item.fieldId}><dt>{field.label} · {summaryMethods.find(([id])=>id===item.aggregate)?.[1]}</dt><dd>{result.available?<>{result.value}{result.note&&<><br/><small>{result.note}</small></>}</>:`Unavailable: ${result.reason}`}</dd></div>})}</dl><SavedGroupCounts schema={schema} snapshot={current.snapshot} /></>}</section>
}
