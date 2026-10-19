import { currencyScale } from './workspace-money'

/** Convert a nonnegative decimal amount without rounding or floating-point arithmetic. */
export function parseWorkspaceMoney(value: string, currency: string): number {
  const scale = currencyScale(currency)
  const [whole, fraction = ''] = value.split('.')
  if (!/^\d+(?:\.\d+)?$/.test(value) || fraction.length > scale) {
    throw new Error(scale === 0
      ? `Enter a nonnegative whole amount in ${currency}.`
      : `Enter a nonnegative amount in ${currency} with no more than ${scale} decimal places.`)
  }
  const exact = BigInt(whole!) * 10n ** BigInt(scale) + (fraction ? BigInt(fraction.padEnd(scale, '0')) : 0n)
  if (exact > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('The amount exceeds Launch’s supported limit.')
  return Number(exact)
}
