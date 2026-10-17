import type { Cell, CellValue } from '../../contracts/primitives'
import type { Expr } from './contracts'
import type { FormulaContext } from './formulas'
import { arithmetic, isMoney, truthy } from './formula-values'
import { compare, divide } from './exact'
const value = (v: CellValue): Cell => ({state:'value',value:v})
export async function evaluateRollup(expr: Extract<Expr,{kind:'rollup'}>, ctx: FormulaContext): Promise<Cell> {
  const cells = await ctx.rollup(expr.relationFieldId,expr.valueFieldId,expr.filter,expr.aggregate==='countall')
  if(cells.length>10000)return {state:'unavailable',code:'rollup_limit',fieldIds:[expr.relationFieldId],message:'Rollup exceeds 10,000 authorized records'}
  const bad=cells.find(c=>c.state!=='value');if(bad)return bad
  let values=cells.flatMap(c=>c.state==='value'&&c.value!==null?[c.value]:[])
  if(expr.aggregate==='countall')return value(String(cells.length))
  if(expr.aggregate==='counta')return value(String(values.filter(v=>v!=='').length))
  if(expr.aggregate==='count'){const source=ctx.sourceType?.(expr.relationFieldId,expr.valueFieldId);return value(String(values.filter(v=>isMoney(v)||typeof v==='string'&&(!source||source==='number')&&/^-?(0|[1-9]\d*)(\.\d+)?$/.test(v)).length))}
  if(expr.aggregate==='lookup'){if(cells.length>1)throw new Error('Lookup requires a single linked record');return value(values[0]??null)}
  if(expr.aggregate==='and'||expr.aggregate==='or')return value(expr.aggregate==='and'?values.every(truthy):values.some(truthy))
  if(['arrayjoin','arrayunique'].includes(expr.aggregate)&&ctx.sourceType?.(expr.relationFieldId,expr.valueFieldId)==='select'){const options=ctx.sourceOptions?.(expr.relationFieldId,expr.valueFieldId);values=values.map(value=>{const option=options?.find(o=>o.id===value);if(!option)throw new Error('Source select option is unavailable');return option.label})}
  if(expr.aggregate==='arrayjoin'){if(values.some(v=>!['string','boolean'].includes(typeof v)))throw new Error('ARRAYJOIN needs scalar string or boolean values');return value(values.map(v=>typeof v==='boolean'?(v?'1':'0'):String(v)).join(expr.separator??','))}
  if(expr.aggregate==='arrayunique'){if(values.some(v=>typeof v!=='string'))throw new Error('ARRAYUNIQUE needs scalar string values');return value([...new Set(values as string[])])}
  if(!values.length)return value(null)
  let result:CellValue=values[0]!
  for(const next of values.slice(1)){
    if(expr.aggregate==='sum'||expr.aggregate==='average')result=arithmetic('add',[result,next])
    else if(isMoney(result)||isMoney(next)){
      if(!isMoney(result)||!isMoney(next)||result.currency!==next.currency||result.scale!==next.scale)throw new Error('mixed_currency')
      if((compare(result.minor,next.minor)>0)===(expr.aggregate==='min'))result=next
    }else{
      if(typeof result!=='string'||typeof next!=='string')throw new Error('Invalid rollup values')
      if((compare(result,next)>0)===(expr.aggregate==='min'))result=next
    }
  }
  if(expr.aggregate==='average'){
    if(isMoney(result)){const minor=divide(result.minor,String(values.length));if(minor.includes('.'))throw new Error('Money average is not an exact minor unit');result={...result,minor}}
    else result=divide(String(result),String(values.length))
  }
  return value(result)
}
