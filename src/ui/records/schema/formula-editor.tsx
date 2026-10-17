import { useRef } from 'react'
import type { Field } from '../../../domains/records/contracts'
import type { SchemaDraft } from '../../../domains/records/manual/contracts'
import { parseFormula } from '../../../domains/records/formula-parser'
import { formulaText } from '../../../domains/records/formula-text'
import { expressionType } from '../../../domains/records/calculation-schema'
import { formulaFunctions } from '../../../domains/records/formula-functions'

export function FormulaEditor({field,table,draft,onChange}:{field:Field;table:SchemaDraft['tables'][number];draft:SchemaDraft;onChange:(field:Field,source?:string)=>void}){
 const input=useRef<HTMLTextAreaElement>(null),source=draft.formulaSources?.[field.id]??formulaText(field.expression,table.fields)
 let error='',type:string=field.resultType??'text'
 try{type=expressionType(parseFormula(source,table.fields),table,draft.tables)}catch(e){error=(e as Error).message}
 function update(text:string){
  try{const expression=parseFormula(text,table.fields),type=expressionType(expression,table,draft.tables);onChange({...field,readOnly:true,expression,resultType:type==='blank'?'text':type,options:undefined},text)}
  catch{onChange({...field,expression:undefined,options:undefined},text)}
 }
 function insert(text:string){const start=input.current?.selectionStart??source.length,end=input.current?.selectionEnd??source.length;update(source.slice(0,start)+text+source.slice(end));requestAnimationFrame(()=>{input.current?.focus();input.current?.setSelectionRange(start+text.length,start+text.length)})}
 const token=/[A-Za-z_]*$/.exec(source.slice(0,input.current?.selectionStart??source.length))?.[0]??''
 const suggestions=Object.values(formulaFunctions).filter(f=>!token||f.name.startsWith(token.toUpperCase())).slice(0,8)
 const issue=`formula-${field.id}-error`
 return <div className="cr-formula-editor">
  <label className="cr-field">Formula<textarea ref={input} aria-label={`Formula for ${field.label}`} aria-invalid={!!error} aria-describedby={issue} value={source} onChange={e=>update(e.target.value)} rows={3} required placeholder={'IF({Amount} > 0, {Amount} * 2, 0)'} /></label>
  <p id={issue} className={error?'cr-error':'cr-muted'} role={error?'alert':undefined}>{error?`${field.label}: ${error}`:`Result type: ${type==='blank'?'text':type}`}</p>
  <details><summary>Fields and functions</summary><div className="cr-actions">{table.fields.filter(f=>f.id!==field.id&&!['relation','attachment','multi_select'].includes(f.type)).map(f=><button type="button" className="cr-button cr-button--quiet" key={f.id} onClick={()=>insert(`{${f.label}}`)}>{`{${f.label}}`}</button>)}</div><div className="cr-actions" aria-label="Function suggestions">{suggestions.map(f=><button type="button" className="cr-button cr-button--quiet" key={f.name} onClick={()=>{const start=input.current?.selectionStart??source.length;input.current?.setSelectionRange(start-token.length,start);insert(f.name+'(')}}>{f.name}</button>)}</div></details>
  <p className="cr-muted">Use + − * / &amp;, comparisons, IF, CONCATENATE, AND, OR, NOT, UPPER, LOWER, TRIM and LEN. DATEADD and DATETIME_DIFF support days. This is the supported subset; other Airtable functions are unavailable.</p>
 </div>
}
