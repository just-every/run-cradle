/** Device-only drafts. This module has no network path and never submits work. */
export type LocalDraft = { id: string; ownerId: string; appId: string; formId: string; text: string; files: File[]; updatedAt: string; commandId: string | null; storeId?: string; assetId?: string }
const databaseName = 'cradle-local-drafts'
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('drafts', { keyPath: 'id' })
    request.onerror = () => reject(new Error('This device could not open local draft storage.'))
    request.onsuccess = () => resolve(request.result)
  })
}
export async function saveLocalDraft(draft: LocalDraft) {
  const db = await database()
  try { await new Promise<void>((resolve, reject) => { const transaction = db.transaction('drafts', 'readwrite'); transaction.objectStore('drafts').put(draft); transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(new Error('The draft could not be saved on this device. Keep this page open.')); transaction.onabort = () => reject(new Error('Device storage did not retain this draft.')) }) } finally { db.close() }
}
export async function readLocalDraft(id: string, ownerId: string): Promise<LocalDraft | null> {
  const db = await database()
  try { return await new Promise((resolve, reject) => { const request = db.transaction('drafts').objectStore('drafts').get(id); request.onerror = () => reject(new Error('This device could not read the local draft.')); request.onsuccess = () => { const draft = request.result as LocalDraft | undefined; resolve(draft?.ownerId === ownerId ? draft : null) } }) } finally { db.close() }
}
export async function discardLocalDraft(id: string, ownerId: string) {
  const draft = await readLocalDraft(id, ownerId)
  if (!draft) return
  const db = await database()
  try { await new Promise<void>((resolve, reject) => { const transaction = db.transaction('drafts', 'readwrite'); transaction.objectStore('drafts').delete(id); transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(new Error('Could not discard the saved draft.')) }) } finally { db.close() }
}
