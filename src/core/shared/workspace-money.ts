/** ISO minor-unit precision comes from the same currency data used for presentation. */
export function currencyScale(currency: string): number {
  const scale = new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits
  if (scale === undefined) throw new Error('Currency minor-unit precision is unavailable')
  return scale
}

export function minorDecimal(minor: number | bigint, currency: string): string {
  if (typeof minor === 'number' && !Number.isSafeInteger(minor)) throw new Error('Money must be a safe minor-unit integer')
  const scale = currencyScale(currency), amount = BigInt(minor), absolute = amount < 0n ? -amount : amount, divisor = 10n ** BigInt(scale)
  return `${amount < 0n ? '-' : ''}${absolute / divisor}${scale ? '.' + String(absolute % divisor).padStart(scale, '0') : ''}`
}

/** Format integer parts separately so even the largest admitted amount keeps every minor unit. */
export function formatWorkspaceMoney(minor: number | bigint, currency: string): string {
  const decimal = minorDecimal(minor, currency), [whole, fraction] = decimal.split('.'), integer = BigInt(whole!), negativeZero = whole === '-0'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).formatToParts(negativeZero ? -0 : integer)
    .map(part => part.type === 'fraction' ? fraction! : part.value).join('')
}
