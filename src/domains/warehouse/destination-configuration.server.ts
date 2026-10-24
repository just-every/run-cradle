import {z} from 'zod'
import {validateDestination} from '../../../vendor/base/modules/integrations/core/destination.ts'
const identifier=z.string().regex(/^[A-Za-z_][A-Za-z0-9_$]{0,127}$/)
const prefix=z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,40}$/)
export const s3Schema=z.object({kind:z.literal('s3'),endpoint:z.string().max(500),region:z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),bucket:z.string().min(3).max(63).regex(/^[a-z0-9][a-z0-9.-]+[a-z0-9]$/),prefix:z.string().max(500).default('')}).strict()
const bigquery=z.object({kind:z.literal('bigquery'),project:z.string().regex(/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/),dataset:identifier,tablePrefix:prefix,location:z.string().min(1).max(100).regex(/^[A-Za-z0-9-]+$/)}).strict()
const snowflake=z.object({kind:z.literal('snowflake'),account:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),user:identifier,database:identifier,schema:identifier,tablePrefix:prefix,stage:z.string().max(385).regex(/^[A-Za-z_][A-Za-z0-9_$]*(?:\.[A-Za-z_][A-Za-z0-9_$]*){0,2}$/),stageStorage:s3Schema,warehouse:identifier.optional(),role:identifier.optional()}).strict()
export const destinationSchema=z.discriminatedUnion('kind',[z.object({kind:z.literal('r2')}).strict(),s3Schema,bigquery,snowflake])
export const accessSchema=z.object({accessKeyId:z.string().min(1).max(200),secretAccessKey:z.string().min(1).max(500)}).strict()
export const bigQueryAccessSchema=z.object({clientEmail:z.email().max(200),privateKey:z.string().min(100).max(20000)}).strict()
export const snowflakeAccessSchema=z.object({privateKeyPem:z.string().min(100).max(20000),accessKeyId:z.string().min(1).max(200),secretAccessKey:z.string().min(1).max(500)}).strict()
export const warehouseAccessSchema=z.union([accessSchema,bigQueryAccessSchema,snowflakeAccessSchema])
export type WarehouseDestination=z.infer<typeof destinationSchema>
export type WarehouseAccess=z.infer<typeof warehouseAccessSchema>
export type S3Destination=z.infer<typeof s3Schema>
export type S3Access=z.infer<typeof accessSchema>
export function validateWarehouseDestination(value:WarehouseDestination):WarehouseDestination{
 if(value.kind==='snowflake')return {...value,stageStorage:validateS3(value.stageStorage)}
 return value.kind==='s3'?validateS3(value):value
}
function validateS3(value:S3Destination):S3Destination{
 const url=validateDestination(value.endpoint)
 if(url.search||url.hash||url.pathname!=='/')throw new Error('S3 endpoint must be a public HTTPS origin without a path or query.')
 if(value.prefix.split('/').some(part=>part==='.'||part==='..')||/[\r\n\0]/.test(value.prefix))throw new Error('S3 prefix must not contain traversal or control characters.')
 return {...value,endpoint:url.origin,prefix:value.prefix.replace(/^\/+|\/+$/g,'')}
}

export function validateWarehouseCredentials(destination:WarehouseDestination,value:WarehouseAccess):WarehouseAccess{
 return destination.kind==='bigquery'?bigQueryAccessSchema.parse(value):destination.kind==='snowflake'?snowflakeAccessSchema.parse(value):accessSchema.parse(value)
}
