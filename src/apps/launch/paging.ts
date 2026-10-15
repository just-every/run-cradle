/** A sort key ends with the record ID, so every key is unique and the order is total. */
export type SortValue = string | number | null
export type SortKey = SortValue[]
export type Direction = 'asc' | 'desc'

function compareValue(a: SortValue, b: SortValue) {
 if (a === b) return 0
 if (a === null) return -1
 if (b === null) return 1
 if (typeof a === 'number' && typeof b === 'number') return a - b
 return String(a).localeCompare(String(b), 'en')
}
export function compareKeys(a: SortKey, b: SortKey, directions: Direction[]) {
 for (let index = 0; index < a.length; index++) {
  const compared = compareValue(a[index] ?? null, b[index] ?? null)
  if (compared) return directions[index] === 'desc' ? -compared : compared
 }
 return 0
}
const encode = (key: SortKey) => btoa(JSON.stringify(key)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
function decode(cursor: string, length: number): SortKey {
 try {
  const key = JSON.parse(atob(cursor.replaceAll('-', '+').replaceAll('_', '/'))) as unknown
  if (Array.isArray(key) && key.length === length && key.every(value => value === null || ['string', 'number'].includes(typeof value))) return key as SortKey
 } catch { /* Rejected below with the same message as any other invalid cursor. */ }
 throw new Error('Invalid page cursor or limit')
}
/** Collection envelope with a keyset cursor: the next page starts strictly after the
 * last key returned, so records added or removed meanwhile never repeat or skip others. */
export function launchCollection<T>(items: T[], cursor: string | undefined, limitText: string | undefined, keyOf: (item: T) => SortKey, directions: Direction[]) {
 const limit = limitText === undefined ? 200 : Number(limitText)
 if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error('Invalid page cursor or limit')
 const keyed = items.map(item => ({ item, key: keyOf(item) })).sort((a, b) => compareKeys(a.key, b.key, directions))
 const after = cursor === undefined ? null : decode(cursor, directions.length)
 const start = after ? keyed.findIndex(entry => compareKeys(entry.key, after, directions) > 0) : 0
 const page = start < 0 ? [] : keyed.slice(start, start + limit), total = Math.min(items.length, 10000)
 const more = start >= 0 && start + limit < keyed.length
 return { items: page.map(entry => entry.item), cursor: more ? encode(page.at(-1)!.key) : null, total, totalLabel: items.length > 10000 ? '10,000+' : String(total), shown: page.length }
}
