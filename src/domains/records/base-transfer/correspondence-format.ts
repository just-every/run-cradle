import { ImportInputError } from './input-error'
import { z } from 'zod'
import { idSchema,cellValueSchema } from '../validators'
import { portableFieldSchema,portableValidationRuleSchema } from './json-format'
const id=z.string().min(1).max(500),ordinal=z.number().int().min(1).max(10000)
export const correspondenceSchema=z.object({
 format:z.literal('cradle-csv-correspondence'),version:z.literal(1),baseId:idSchema.optional(),
 tables:z.array(z.object({id,filename:id,bytes:z.number().int().min(0).max(10485760),sha256:z.string().regex(/^[a-f0-9]{64}$/),primaryColumnKey:id,validationRules:z.array(portableValidationRuleSchema).max(50).optional(),
  columns:z.array(z.object({id,key:id,type:z.enum(['email','rating','duration','phone','text','number','date','instant','money','boolean','select','multi_select','url','person','relation','attachment','computed']),required:z.boolean(),unique:z.boolean(),relation:portableFieldSchema.shape.relation,options:portableFieldSchema.shape.options,validation:portableFieldSchema.shape.validation,numberFormat:portableFieldSchema.shape.numberFormat,defaultValue:cellValueSchema.optional()}).strict()).min(1).max(160),
  rows:z.array(z.object({id,ordinal,primary:z.string().max(100000)}).strict()).max(10000)
 }).strict()).min(1).max(20),
 references:z.array(z.object({tableId:id,recordId:id,columnId:id,occurrence:z.number().int().min(0).max(9999),referenceText:z.string().max(100000),targetTableId:id,targetRecordId:id}).strict()).max(16000000),
 cells:z.array(z.object({tableId:id,recordId:id,columnId:id,state:z.enum(['null','empty','false'])}).strict()).max(16000000)
}).strict()
export type CsvCorrespondence=z.infer<typeof correspondenceSchema>
export type CorrespondenceReview={fingerprint:string;accepted:boolean;references:{sourcePrimary:string;key:string;tableKey:string;rowKey:string;columnKey:string;occurrence:number;token:string;state:'resolved'|'ambiguous';targetTableKey:string;selectedRowKey:string;candidates:{rowKey:string;values:Record<string,unknown>}[]}[];cells:{tableKey:string;rowKey:string;columnKey:string;state:'null'|'empty'|'false'}[]}
export const referenceCoordinate=(table:string,row:string,column:string,occurrence:number)=>JSON.stringify([table,row,column,occurrence])

export function parseCorrespondence(value:unknown):CsvCorrespondence {const parsed=correspondenceSchema.safeParse(value);if(!parsed.success)throw new ImportInputError('correspondence.json: '+parsed.error.issues.slice(0,5).map(issue=>`${issue.path.join('.')}: ${issue.message}`).join('; '));return parsed.data}
