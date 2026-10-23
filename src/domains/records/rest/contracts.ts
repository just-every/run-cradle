import {z} from 'zod'
import {idSchema,cellValueSchema} from '../validators'
const values=z.record(idSchema,cellValueSchema)
export const createRow=z.object({values}).strict()
export const updateRow=z.object({recordId:idSchema,version:z.number().int().positive(),changes:values}).strict()
export const deleteRow=z.object({recordId:idSchema,version:z.number().int().positive(),confirmation:idSchema}).strict()
const command={commandId:idSchema,schemaVersion:z.number().int().positive()}
export const createInput=z.object({...command,values}).strict()
export const updateInput=z.object({commandId:idSchema,version:z.number().int().positive(),changes:values}).strict()
export const deleteInput=z.object({commandId:idSchema,version:z.number().int().positive(),confirmation:idSchema}).strict()
export const upsertInput=z.object({...command,mergeFieldId:idSchema,values}).strict()
export const batchInput=z.discriminatedUnion('operation',[
 z.object({...command,operation:z.literal('create'),rows:z.array(createRow).min(1).max(100)}).strict(),
 z.object({commandId:idSchema,operation:z.literal('update'),rows:z.array(updateRow).min(1).max(100)}).strict(),
 z.object({commandId:idSchema,operation:z.literal('delete'),rows:z.array(deleteRow).min(1).max(100)}).strict(),
])
