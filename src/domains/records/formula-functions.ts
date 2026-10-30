/** The shipped function set. UI suggestions, parsing and adoption share this registry. */
export const formulaFunctions = {
  add: { name: 'ADD', min: 2, max: 2, result: 'number' },
  subtract: { name: 'SUBTRACT', min: 2, max: 2, result: 'number' },
  multiply: { name: 'MULTIPLY', min: 2, max: 2, result: 'number' },
  divide: { name: 'DIVIDE', min: 2, max: 2, result: 'number' },
  abs: { name: 'ABS', min: 1, max: 1, result: 'number' },
  concat: { name: 'CONCATENATE', min: 1, max: 100, result: 'text' },
  coalesce: { name: 'COALESCE', min: 1, max: 100, result: 'argument' },
  eq: { name: 'EQUAL', min: 2, max: 2, result: 'boolean' },
  ne: { name: 'NOT_EQUAL', min: 2, max: 2, result: 'boolean' },
  lt: { name: 'LESS', min: 2, max: 2, result: 'boolean' },
  lte: { name: 'LESS_EQUAL', min: 2, max: 2, result: 'boolean' },
  gt: { name: 'GREATER', min: 2, max: 2, result: 'boolean' },
  gte: { name: 'GREATER_EQUAL', min: 2, max: 2, result: 'boolean' },
  if: { name: 'IF', min: 3, max: 3, result: 'branch' },
  and: { name: 'AND', min: 1, max: 100, result: 'boolean' },
  or: { name: 'OR', min: 1, max: 100, result: 'boolean' },
  not: { name: 'NOT', min: 1, max: 1, result: 'boolean' },
  upper: { name: 'UPPER', min: 1, max: 1, result: 'text' },
  lower: { name: 'LOWER', min: 1, max: 1, result: 'text' },
  trim: { name: 'TRIM', min: 1, max: 1, result: 'text' },
  len: { name: 'LEN', min: 1, max: 1, result: 'number' },
  date_add: { name: 'DATEADD', min: 2, max: 2, result: 'date' },
  days_between: { name: 'DATETIME_DIFF', min: 2, max: 2, result: 'number' },
} as const
export type FormulaFunction = keyof typeof formulaFunctions
export function functionDefinition(fn: string) {
  if (!Object.hasOwn(formulaFunctions, fn)) throw new Error('Unsupported formula function')
  return formulaFunctions[fn as FormulaFunction]
}
export function validateFunction(fn: string, count: number): void {
  const definition = functionDefinition(fn)
  if (count < definition.min || count > definition.max) throw new Error(`${definition.name} expects ${definition.min === definition.max ? definition.min : `${definition.min}–${definition.max}`} arguments`)
}
