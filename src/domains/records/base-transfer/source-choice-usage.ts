import { parseLinkCell } from './parse'

/** Multi-select display exports add spaces after comma separators. Unlike link
 * identity parsing, that formatting is not part of a declared choice label.
 * An exact declared label always wins, including labels with leading spaces. */
export function sourceChoiceUsage(display:string,choices:readonly string[]):string[] {
 let normalized='',quoted=false
 for(let i=0;i<display.length;i++){
  const character=display[i];normalized+=character
  if(character==='"'){
   if(quoted&&display[i+1]==='"'){normalized+=display[++i];continue}
   quoted=!quoted
  }else if(character===','&&!quoted){
   let next=i+1;while(display[next]===' ')next++
   // Whitespace before a quoted cell is delimiter decoration. Other values
   // retain it until the exact declared label can be checked below.
   if(display[next]==='"')i=next-1
  }
 }
 return parseLinkCell(normalized).map(value=>choices.includes(value)?value:choices.includes(value.trimStart())?value.trimStart():value)
}
