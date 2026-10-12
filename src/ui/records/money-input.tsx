import { useState } from 'react'
import type { CellValue, Money } from '../../contracts/primitives'
import type { Field } from '../../domains/records/contracts'
function decimalAmount(value: Money) { const negative = value.minor.startsWith('-'); const digits = value.minor.replace('-', '').padStart(value.scale + 1, '0'); return `${negative ? '-' : ''}${value.scale ? digits.slice(0, -value.scale) : digits}${value.scale ? `.${digits.slice(-value.scale)}` : ''}` }
export function MoneyInput({ field, value, onChange }: { field: Field; value: CellValue; onChange: (value: CellValue) => void }) {
  const initial = value && typeof value === 'object' && 'minor' in value ? value : null
  const [amount, setAmount] = useState(initial ? decimalAmount(initial) : '')
  const [currency, setCurrency] = useState(initial?.currency ?? '')
  const scale = initial?.scale ?? 2
  const update = (text: string, code: string) => {
    if (text === '') { onChange(null); return }
    if (!new RegExp(`^-?\\d+(\\.\\d{0,${scale}})?$`).test(text)) return
    const [whole, fraction = ''] = text.split('.')
    onChange({ minor: `${whole}${fraction.padEnd(scale, '0')}`.replace(/^(-?)0+(?=\d)/, '$1'), currency: code, scale })
  }
  return <div className="cr-actions"><input id={`field-${field.id}`} aria-label={`${field.label} amount`} required={field.required} inputMode="decimal" pattern={`-?[0-9]+(\\.[0-9]{0,${scale}})?`} placeholder="0.00" value={amount} onChange={event => { setAmount(event.target.value); update(event.target.value, currency) }} /><input aria-label={`${field.label} currency`} placeholder="Currency (e.g. AUD)" pattern="[A-Z]{3}" required={field.required || amount !== ''} value={currency} onChange={event => { const code = event.target.value.toUpperCase(); setCurrency(code); update(amount, code) }} /></div>
}
