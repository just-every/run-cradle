import { useEffect, useState } from 'react'
import { useDocumentSession } from '../../core/app/document-context'
import type { RecordRow } from '../../domains/records/contracts'

/** Card order is a per-operator presentation preference for this browser tab. Record values remain server-owned. */
export function useBoardOrder(appId:string,entityId:string,fieldId:string){
 const session=useDocumentSession(),key=`cradle-board-order:${session?.operator.id}:${appId}:${entityId}:${fieldId}`
 const [state,setState]=useState<{key:string;ids:string[];error:string}>({key:'',ids:[],error:''})
 useEffect(()=>{try{const raw=sessionStorage.getItem(key),ids=raw?JSON.parse(raw):[];if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'))throw Error('Invalid order');setState({key,ids,error:''})}catch{setState({key,ids:[],error:'Card order could not be read from browser session storage.'})}},[key])
 useEffect(()=>{const clear=()=>{sessionStorage.removeItem(key);setState({key,ids:[],error:''})};document.addEventListener('cradle:session-revoked',clear);return()=>document.removeEventListener('cradle:session-revoked',clear)},[key])
 const ids=state.key===key?state.ids:[]
 return {error:state.error,sort:(rows:RecordRow[])=>[...rows].sort((a,b)=>{const ai=ids.indexOf(a.id),bi=ids.indexOf(b.id);return (ai<0?ids.length:ai)-(bi<0?ids.length:bi)}),before:(rows:RecordRow[],id:string,target:string)=>{const ordered=rows.map(row=>row.id).filter(value=>value!==id),index=ordered.indexOf(target);if(index<0)return;ordered.splice(index,0,id);const next=[...ordered,...ids.filter(value=>!ordered.includes(value))].slice(0,10000);try{sessionStorage.setItem(key,JSON.stringify(next));setState({key,ids:next,error:''})}catch{setState(current=>({...current,error:'Card order could not be saved. Enable browser session storage.'}))}}}
}
