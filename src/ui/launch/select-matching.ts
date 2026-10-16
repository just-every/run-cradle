import { sessionFetch } from '../shared/session-fetch'

/** Every campaign the grid's current conditions select, up to one bulk change's 500 records. */
export async function selectAllMatching(listUrl: string) {
 const items: { id: string; version: number }[] = []
 let cursor: string | null = null
 do {
  const response = await sessionFetch(`${listUrl}&limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
  if (!response.ok) throw new Error(`Reading matching campaigns returned ${response.status}.`)
  const page = await response.json() as { items: { id: string; version: number }[]; cursor: string | null }
  items.push(...page.items.map(item => ({ id: item.id, version: item.version })))
  cursor = page.cursor
 } while (cursor && items.length < 500)
 return items.slice(0, 500)
}
