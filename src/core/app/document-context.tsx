import { createContext, useContext } from 'react'
import type { CurrentSession } from '../shared/session'

export const DocumentSession = createContext<CurrentSession | undefined>(undefined)
export const useDocumentSession = () => useContext(DocumentSession)

/** The installed workspace controls presentation of instants throughout the app. */
export function useWorkspaceTimezone() {
  const session = useDocumentSession()
  if (!session) throw new Error('Workspace time requires an authenticated document session.')
  return session.workspace.timezone
}
