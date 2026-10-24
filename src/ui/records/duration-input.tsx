import { useEffect, useRef, useState } from 'react'
import type { CellValue } from '../../contracts/primitives'
import { durationFromText, durationText } from '../../domains/records/typed-values'

export function DurationInput({value,onChange,...props}:{value:CellValue;onChange:(value:CellValue)=>void;id:string;required:boolean;'aria-invalid':boolean;'aria-describedby'?:string}) {
 const shown=()=>typeof value==='string'?(()=>{try{return durationText(value)}catch{return value}})():''
 const [text,setText]=useState(shown),focused=useRef(false)
 useEffect(()=>{if(!focused.current)setText(shown())},[value])
 return <input {...props} type="text" placeholder="h:mm or h:mm:ss" value={text} onFocus={()=>{focused.current=true}} onBlur={()=>{focused.current=false;try{setText(text?durationText(durationFromText(text)):'')}catch{}}} onChange={event=>{const next=event.target.value;setText(next);if(!next){onChange(null);return}try{onChange(durationFromText(next))}catch{onChange(next)}}} />
}
