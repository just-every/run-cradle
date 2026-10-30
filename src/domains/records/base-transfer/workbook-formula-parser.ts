import type {Expr} from '../contracts'
import type {SourceFormula,SourceTable} from './contracts'
import {exactApiNumber} from './numeric-lexeme'

/** Deliberately bounded Excel arithmetic; references keep their mapped field identity. */
export function workbookExpression(formula:SourceFormula,rowNumber:number,table:SourceTable,fields:Record<string,string>):Expr {
 if(formula.kind)throw new Error(`Unsupported ${formula.kind} formula`)
 const text=formula.expression.replace(/^=/,''),tokens:string[]=[]
 let offset=0
 while(offset<text.length){
  if(/\s/.test(text[offset])){offset++;continue}
  const token=/^(?:\$?[A-Za-z]+\$?[1-9]\d*|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[()+*/-])/.exec(text.slice(offset))?.[0]
  if(!token)throw new Error('Unsupported formula reference or operation')
  tokens.push(token);offset+=token.length
  if(tokens.length>128)throw new Error('Formula exceeds the supported arithmetic size')
 }
 let cursor=0
 const literal=(value:string):Expr=>({kind:'literal',value,valueType:'number'})
 const call=(fn:string,a:Expr,b:Expr):Expr=>({kind:'call',fn,args:[a,b]})
 function atom(depth:number):Expr {
  if(depth>32)throw new Error('Formula exceeds the supported arithmetic depth')
  const token=tokens[cursor++]
  if(token==='('){const value=sum(depth+1);if(tokens[cursor++]!==')')throw new Error('Unclosed formula parentheses');return value}
  if(token==='+'||token==='-'){const value=atom(depth+1);return token==='+'?value:call('subtract',literal('0'),value)}
  const ref=token&&/^\$?([A-Za-z]+)\$?([1-9]\d*)$/.exec(token)
  if(ref){
   if(Number(ref[2])!==rowNumber)throw new Error('Only same-row references are supported')
   let index=0;for(const c of ref[1].toUpperCase())index=index*26+c.charCodeAt(0)-64
   const column=table.columns[index-1];if(!column)throw new Error('Formula references a column outside this table')
   return {kind:'field',fieldId:fields[column.key]}
  }
  if(token&&/^(?:\d|\.)/.test(token))return literal(exactApiNumber(token.startsWith('.')?'0'+token:token.replace(/\.(?=[eE]|$)/,'.0')))
  throw new Error('Expected a number, same-row reference or parentheses')
 }
 function product(depth:number):Expr {let out=atom(depth);while(['*','/'].includes(tokens[cursor])){const operator=tokens[cursor++];out=call(operator==='*'?'multiply':'divide',out,atom(depth))}return out}
 function sum(depth:number):Expr {let out=product(depth);while(['+','-'].includes(tokens[cursor])){const operator=tokens[cursor++];out=call(operator==='+'?'add':'subtract',out,product(depth))}return out}
 const expression=sum(1);if(cursor!==tokens.length)throw new Error('Unsupported formula reference or operation')
 return expression
}
export function workbookDependencies(expr:Expr):string[]{return expr.kind==='field'?[expr.fieldId]:expr.kind==='call'?expr.args.flatMap(workbookDependencies):[]}
