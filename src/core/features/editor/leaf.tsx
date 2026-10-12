import {type ComponentType} from 'react'
import {useRouterState} from '@tanstack/react-router'
import {useEditorLeafReady} from '../../../editor/react'
/** Runs inside each rendered destination, after its native leaf has hydrated. */
export function editorLeaf<P extends object>(Component:ComponentType<P>){
 return function EditorReadyLeaf(props:P){
  const key=useRouterState({select:state=>state.location.href})
  useEditorLeafReady(key)
  return <Component {...props}/>
 }
}
