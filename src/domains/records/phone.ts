import type { Field } from './contracts'

/** US-first telephone input; stored values always use E.164. */
export function phoneValue(value: unknown): string {
 if (typeof value !== 'string') throw new Error('Expected a phone number.')
 const digits = value.trim().replace(/[\s().-]/g, '')
 const number = digits.startsWith('+') ? digits : /^\d{10}$/.test(digits) ? '+1' + digits : /^1\d{10}$/.test(digits) ? '+' + digits : ''
 if (!/^\+[1-9]\d{7,14}$/.test(number)) throw new Error('Phone must use E.164; US numbers may omit +1.')
 return number
}
export function phoneText(value: string): string {
 return /^\+1\d{10}$/.test(value) ? `(${value.slice(2,5)}) ${value.slice(5,8)}-${value.slice(8)}` : value
}

/** SMS recipients are authored Phone fields or lookups retaining that type. */
export function smsPhoneField(field: Field): boolean {
 return field.type === 'phone' || field.type === 'computed' && field.expression?.kind === 'rollup' && field.expression.aggregate === 'lookup' && (field.resultType === 'phone' || field.resultElementType === 'phone')
}
