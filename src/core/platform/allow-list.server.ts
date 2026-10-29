/** The same explicit installation allow-list governs native and agent admission. */
export function authAllowList(value?: string): string[] | undefined {
  if (value === undefined) return undefined
  const entries = value.split(',').map(item => item.trim().toLowerCase()).filter(Boolean)
  if (!entries.length || entries.some(item => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item))) throw new Error('AUTH_ALLOW_LIST must contain comma-separated email addresses.')
  return [...new Set(entries)]
}
