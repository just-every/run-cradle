import {z} from 'zod'
import type {Cell} from '../../contracts/primitives'

export const resyncMessage='Something in this subscribed range could not be narrowed for this key; resynchronize the scope.'
const metadata={id:z.string(),sequence:z.number().int().nonnegative(),recordId:z.string()}
const cell=z.custom<Cell>()
const payload=z.object({...metadata,kind:z.enum(['create','update','restore']),entityId:z.string(),changes:z.array(z.object({fieldId:z.string(),before:cell,after:cell}).strict())}).strict()
export const changeItemSchema=z.union([z.object({...metadata,kind:z.literal('delete')}).strict(),payload])
export const changePageSchema=z.object({
 items:z.array(changeItemSchema),cursor:z.string(),through:z.string(),hasMore:z.boolean(),
 resyncRequired:z.object({code:z.literal('resync_required'),message:z.literal(resyncMessage),from:z.string(),through:z.string()}).strict().optional(),
}).strict()
export type ChangeItem=z.infer<typeof changeItemSchema>
