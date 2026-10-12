import {useEffect,useLayoutEffect,useRef,useState} from 'react'
import {configLoader,createOwnerEditor} from '../../../editor'
import type {CurrentSession} from '../../shared/session'
const useClientLayoutEffect=typeof document==='undefined'?useEffect:useLayoutEffect

/** One current owner shell owns the lease; the server admits every renewal. */
export function OwnerEditorShell({session}:{session:CurrentSession}){
 const controller=useRef<ReturnType<typeof createOwnerEditor>|null>(null),[failed,setFailed]=useState(false)
 useClientLayoutEffect(()=>{
  if(!session.editorOwner||!session.editorConfigured)return
  const editor=createOwnerEditor();controller.current=editor;editor.setOwner(true)
  const load=configLoader('/api/editor/config',window.location.origin)
  const refresh=()=>{setFailed(false);void editor.refresh(load).catch(()=>setFailed(true))}
  const revoke=()=>editor.setOwner(false)
  refresh();const timer=setInterval(refresh,20000)
  window.addEventListener('focus',refresh);document.addEventListener('cradle:session-revoked',revoke)
  return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('cradle:session-revoked',revoke);editor.dispose();controller.current=null}
 },[session.operator.id,session.editorOwner,session.editorConfigured])
 return failed?<p className="cr-error" role="alert">The editor is unavailable. Check your current owner session and management configuration.</p>:null
}
