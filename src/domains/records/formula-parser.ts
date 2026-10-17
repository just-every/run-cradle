import type { Expr, Field } from './contracts'
import { normalize } from './exact'
import { formulaFunctions, validateFunction } from './formula-functions'

export class FormulaSyntaxError extends Error {
  constructor(message: string, readonly position: number) { super(`${message} at position ${position + 1}`); this.name = 'FormulaSyntaxError' }
}
type Token = { text: string; position: number; kind: 'number' | 'string' | 'field' | 'name' | 'symbol' | 'end' }
const operators: Record<string, [number, string]> = { '=': [1, 'eq'], '!=': [1, 'ne'], '<': [1, 'lt'], '<=': [1, 'lte'], '>': [1, 'gt'], '>=': [1, 'gte'], '&': [2, 'concat'], '+': [3, 'add'], '-': [3, 'subtract'], '*': [4, 'multiply'], '/': [4, 'divide'] }
function tokenize(source: string): Token[] {
  if (source.length > 10000) throw new FormulaSyntaxError('Formula exceeds 10,000 characters', 10000)
  const tokens: Token[] = []; let position = 0
  while (position < source.length) {
    if (/\s/.test(source[position]!)) { position++; continue }
    const start = position, first = source[position]!
    if (tokens.length >= 512) throw new FormulaSyntaxError('Formula exceeds 512 tokens', start)
    if (first === '"' || first === "'") {
      position++; let text = '', closed = false
      while (position < source.length) {
        const next = source[position++]!
        if (next === first) { closed = true; break }
        if (next === '\\') { const escaped = source[position++]; if (!escaped || !['\\', '"', "'", 'n', 'r', 't'].includes(escaped)) throw new FormulaSyntaxError('Invalid string escape', position - 1); text += ({ n: '\n', r: '\r', t: '\t' } as Record<string,string>)[escaped] ?? escaped }
        else text += next
      }
      if (!closed) throw new FormulaSyntaxError('Unclosed string', start)
      tokens.push({ text, position: start, kind: 'string' }); continue
    }
    if (first === '{') {
      const end = source.indexOf('}', position + 1)
      if (end < 0) throw new FormulaSyntaxError('Unclosed field reference', start)
      tokens.push({ text: source.slice(position + 1, end), position: start, kind: 'field' }); position = end + 1; continue
    }
    const numeric = /^(?:\d+(?:\.\d+)?|\.\d+)/.exec(source.slice(position))
    if (numeric) { tokens.push({ text: numeric[0], position: start, kind: 'number' }); position += numeric[0].length; continue }
    const name = /^[A-Za-z_][A-Za-z_0-9]*/.exec(source.slice(position))
    if (name) { tokens.push({ text: name[0].toUpperCase(), position: start, kind: 'name' }); position += name[0].length; continue }
    const symbol = /^(?:!=|<=|>=|[+\-*/&=<>(),])/.exec(source.slice(position))
    if (!symbol) throw new FormulaSyntaxError(`Unexpected character ${first}`, start)
    tokens.push({ text: symbol[0], position: start, kind: 'symbol' }); position += symbol[0].length
  }
  tokens.push({ text: '', position, kind: 'end' }); return tokens
}
/** Bounded spreadsheet syntax; field IDs, rather than names, remain canonical in storage. */
export function parseFormula(source: string, fields: readonly Field[]): Expr {
  const tokens = tokenize(source); let index = 0
  const peek = () => tokens[index]!, take = () => tokens[index++]!
  function expect(text: string) { if (peek().text !== text) throw new FormulaSyntaxError(`Expected ${text}`, peek().position); take() }
  function expression(minimum = 0, depth = 1): Expr {
    if (depth > 64) throw new FormulaSyntaxError('Expression depth exceeds 64', peek().position)
    const token = take(); let left: Expr
    if (token.kind === 'number') { try { left = { kind: 'literal', value: normalize(token.text.startsWith('.') ? '0' + token.text : token.text.replace(/^0+(?=\d)/, '')), valueType: 'number' } } catch (error) { throw new FormulaSyntaxError((error as Error).message, token.position) } }
    else if (token.kind === 'string') left = { kind: 'literal', value: token.text }
    else if (token.kind === 'field') { const matches = fields.filter(f => f.label === token.text); if (matches.length !== 1) throw new FormulaSyntaxError(`Unknown or ambiguous field {${token.text}}`, token.position); left = { kind: 'field', fieldId: matches[0]!.id } }
    else if (token.text === '(') { left = expression(0, depth + 1); expect(')') }
    else if (token.text === '-' || token.text === '+') { const operand = expression(5, depth + 1); left = token.text === '+' ? operand : { kind: 'call', fn: 'subtract', args: [{ kind: 'literal', value: '0', valueType: 'number' }, operand] } }
    else if (token.kind === 'name') {
      expect('('); const args: Expr[] = []
      if (peek().text !== ')') do { if (args.length) expect(','); args.push(expression(0, depth + 1)) } while (peek().text === ',')
      expect(')')
      if (['TRUE', 'FALSE', 'BLANK'].includes(token.text)) { if (args.length) throw new FormulaSyntaxError(`${token.text} expects no arguments`, token.position); left = { kind: 'literal', value: token.text === 'BLANK' ? null : token.text === 'TRUE' } }
      else {
        const entry = Object.entries(formulaFunctions).find(([, value]) => value.name === token.text)
        if (!entry) throw new FormulaSyntaxError(`Unsupported function ${token.text}`, token.position)
        let values = args
        if (token.text === 'DATEADD' || token.text === 'DATETIME_DIFF') {
          if (args.length !== 3 || args[2]?.kind !== 'literal' || typeof args[2].value !== 'string' || !['day', 'days'].includes(args[2].value.toLowerCase())) throw new FormulaSyntaxError(`${token.text} currently supports the 'days' unit`, token.position)
          values = token.text === 'DATETIME_DIFF' ? [args[1]!, args[0]!] : args.slice(0, 2)
        }
        try { validateFunction(entry[0], values.length) } catch (error) { throw new FormulaSyntaxError((error as Error).message, token.position) }
        left = { kind: 'call', fn: entry[0], args: values }
      }
    } else throw new FormulaSyntaxError('Expected a value, field or function', token.position)
    while (true) { const operator = operators[peek().text]; if (!operator || operator[0] < minimum) break; take(); left = { kind: 'call', fn: operator[1], args: [left, expression(operator[0] + 1, depth + 1)] } }
    return left
  }
  const result = expression(); if (peek().kind !== 'end') throw new FormulaSyntaxError('Unexpected token', peek().position); return result
}
