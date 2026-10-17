/** One variable repeat has exactly one possible width in an anchored pattern.
 * Match its atoms independently so even large fixed repeats cannot backtrack. */
export function validationPattern(source: string): { test(value: string): boolean } {
  if (source.length > 200 || !source.startsWith('^') || !source.endsWith('$'))
    throw new Error('Patterns must be at most 200 characters and start with ^ and end with $.')
  let variable = 0, width = 0
  const atoms: { test: RegExp; min: number; max: number }[] = []
  for (let i = 1; i < source.length - 1; i++) {
    const start = i
    const char = source[i]!
    if (char === '\\') {
      const escaped = source[++i]
      if (i >= source.length - 1 || !escaped || !/^[dDsSwW\\.^$*+?{}()[\]|/-]$/.test(escaped)) throw new Error('Pattern escape is unsupported.')
    } else if (char === '[') {
      let closed = false
      for (i++; i < source.length - 1; i++) {
        if (source[i] === '\\') { i++; if (!source[i] || /[0-9pPkK]/.test(source[i]!)) throw new Error('Pattern escape is unsupported.') }
        else if (source[i] === ']') { closed = true; break }
      }
      if (!closed) throw new Error('Pattern character class is incomplete.')
    } else if ('()|{}*+?^$'.includes(char)) throw new Error('Pattern groups, alternatives and assertions are unsupported.')
    else if (source.codePointAt(i)! > 0xffff) i++
    const atom = source.slice(start, i + 1)
    const quantifier = source[i + 1]
    let min = 1, max = 1
    if (quantifier && '*+?'.includes(quantifier)) { variable++; min = quantifier === '+' ? 1 : 0; max = quantifier === '?' ? 1 : 100000; i++ }
    else if (quantifier === '{') {
      const repeat = source.slice(i + 1).match(/^\{(\d+)(?:,(\d*))?\}/)
      if (!repeat) throw new Error('Pattern repeat is incomplete.')
      min = Number(repeat[1]); max = repeat[2] === undefined ? min : repeat[2] === '' ? 100000 : Number(repeat[2])
      if (min > max || max > 100000) throw new Error('Pattern repeats must be within 0–100000.')
      if (repeat[2] !== undefined) variable++
      i += repeat[0].length
    }
    if (variable > 1) throw new Error('Patterns support at most one variable repeat; use fixed repeats for the other parts.')
    if ((width += min) > 100000) throw new Error('Minimum pattern width cannot exceed 100000 characters.')
    atoms.push({ test: new RegExp(`^(?:${atom})$`, 'u'), min, max })
  }
  const fixed = atoms.filter(atom => atom.min === atom.max).reduce((total, atom) => total + atom.min, 0)
  return { test(value) {
    const characters = [...value], repeated = characters.length - fixed
    if (repeated < 0 || !atoms.some(atom => atom.min !== atom.max) && repeated !== 0) return false
    let position = 0
    for (const atom of atoms) {
      const count = atom.min === atom.max ? atom.min : repeated
      if (count < atom.min || count > atom.max) return false
      for (let n = 0; n < count; n++) if (position >= characters.length || !atom.test.test(characters[position++]!)) return false
    }
    return position === characters.length
  } }
}
