/** Exact JSON-number normalization. Zero, including enormous zero exponents, is 0.
 * Nonzero values must fit 128 whole / 32 fractional digits after insignificant
 * zeros are removed. API mathematical integers still require the safe range.
 */
export function exactApiNumber(lexeme:string):string {
 const match=/^(-?)(0|[1-9]\d*)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(lexeme)
 if(!match||match[0]!==lexeme)throw new Error('Expected original JSON numeric token')
 const [,sign,whole,fraction='',exponent='0']=match,coefficient=whole+fraction
 const leading=coefficient.search(/[1-9]/)
 if(leading<0)return '0'
 const digits=coefficient.slice(leading).replace(/0+$/,'')
 // The source cell has a bounded length. More than six exponent digits cannot
 // bring a nonzero coefficient into native bounds; do not allocate a huge BigInt.
 const exponentDigits=exponent.replace(/^[+-]/,'').replace(/^0+/,'')||'0'
 if(exponentDigits.length>6)throw new Error('Decimal exceeds 128 integer / 32 fractional digits (exponent out of range)')
 const power=BigInt((exponent.startsWith('-')?'-':'')+exponentDigits)
 const point=BigInt(whole.length-leading)+power,length=BigInt(digits.length)
 const wholeDigits=point>0n?point:1n,fractionDigits=length>point?length-point:0n
 if(wholeDigits>128n||fractionDigits>32n)throw new Error('Decimal exceeds 128 integer / 32 fractional digits')
 // Conversion to Number is only for bounded string indices, never the value.
 const position=Number(point)
 const expanded=position<=0?'0.'+'0'.repeat(-position)+digits:position>=digits.length?digits+'0'.repeat(position-digits.length):digits.slice(0,position)+'.'+digits.slice(position)
 if(fractionDigits===0n&&(expanded.length>16||(expanded.length===16&&expanded>'9007199254740991')))throw new Error('Unsafe API integer is outside the exact safe-integer policy; source response bytes retained')
 return sign+expanded
}
