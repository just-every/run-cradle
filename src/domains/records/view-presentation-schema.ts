import {z} from 'zod'
import {idSchema,filterSchema} from './validators'
export const viewPresentationDefinition={
 locked:z.boolean().optional(),
 summaries:z.array(z.object({fieldId:idSchema,aggregate:z.enum(['sum','average','min','max','count','empty','percent-filled'])}).strict()).max(80).optional(),
 formatting:z.array(z.object({filter:filterSchema,target:z.enum(['row','cell']),fieldId:idSchema.optional(),color:z.enum(['mint','butter','coral','lilac'])}).strict()).max(20).optional(),
}
