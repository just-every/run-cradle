const queryValue = /([?&#][^=?&#\s"'<>]+)=([^&#\s"'<>]*)/g

export function sanitizeEvidenceText(value) {
  return String(value).replace(queryValue, '$1=[redacted]')
}

export function sanitizeEvidenceValue(value) {
  if (typeof value === 'string') return sanitizeEvidenceText(value)
  if (Array.isArray(value)) return value.map(sanitizeEvidenceValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeEvidenceValue(item)]))
  }
  return value
}

export function stringifySafeEvidence(value) {
  return JSON.stringify(sanitizeEvidenceValue(value), null, 2)
}
