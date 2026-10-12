import { createContext, useContext } from 'react'
import type { CurrentSession } from '../shared/session'

export const DocumentSession = createContext<CurrentSession | undefined>(undefined)
export const useDocumentSession = () => useContext(DocumentSession)
