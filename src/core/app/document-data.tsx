import { createContext, useContext } from 'react'
export type DocumentData = Record<string, unknown>
export const DocumentDataContext = createContext<DocumentData>({})
export const useDocumentData = () => useContext(DocumentDataContext)

export function useInitialDocumentValue<T>(path: string, decode: (value: unknown) => T): T | undefined {
  const data = useDocumentData()
  return path in data ? decode(data[path]) : undefined
}
