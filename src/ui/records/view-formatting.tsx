import {createContext,useContext,type ReactNode} from 'react'
import type {Field,RecordRow} from '../../domains/records/contracts'
import {viewColor,type ViewColorRule} from '../../domains/records/view-presentation'
import './view-formatting.css'
const Context=createContext<ViewColorRule[]>([])
export function ViewFormatting({rules,children}:{rules:ViewColorRule[];children:ReactNode}){return <Context.Provider value={rules}>{children}</Context.Provider>}
export function useViewColor(fields:Field[]){const rules=useContext(Context);return (row:RecordRow,fieldId?:string)=>viewColor(row,fields,rules,fieldId)}
