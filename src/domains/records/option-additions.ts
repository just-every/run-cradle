import type { Field } from './contracts'
import { canonical } from '../admission/canonical'

/** Appending choices never changes an existing identity, label or stored value. */
export function preservesSelectOptions(before:Field,after:Field){
 return ['select','multi_select'].includes(before.type)&&before.type===after.type&&
  !!before.options&&!!after.options&&after.options.length>=before.options.length&&
  before.options.every((option,index)=>canonical(option)===canonical(after.options![index]))
}
