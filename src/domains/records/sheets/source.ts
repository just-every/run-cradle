import {z} from 'zod'
import {tabularSource} from '../workbooks/source'
import type {UploadedArtifact} from '../base-transfer/contracts'
import {workbookLimits} from '../workbooks/zip'
export const sheetsSourceSchema=z.object({format:z.literal('cradle-google-sheets'),sheets:z.array(z.object({name:z.string().min(1).max(200),headers:z.array(z.string().min(1)).min(1).max(workbookLimits.columns),rows:z.array(z.array(z.object({type:z.enum(['text','number','date','instant','boolean']),value:z.union([z.string(),z.boolean(),z.null()])}).strict()).max(workbookLimits.columns)).max(workbookLimits.rows)}).strict()).min(1).max(workbookLimits.sheets)}).strict()
export const prepareSheetsSource=(artifact:UploadedArtifact)=>{const data=sheetsSourceSchema.parse(JSON.parse(new TextDecoder().decode(artifact.bytes)));for(const sheet of data.sheets)if(new Set(sheet.headers).size!==sheet.headers.length||sheet.rows.some(row=>row.length!==sheet.headers.length))throw new Error('Google Sheet headers and row widths must agree');return tabularSource(data.sheets,artifact,'google-sheets')}
