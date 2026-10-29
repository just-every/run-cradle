import {z} from 'zod'
import {idSchema} from '../validators'
import {baseRoles} from '../manual/base-role'

const label=z.string().trim().min(1).max(200)
export const interfaceComponent=z.discriminatedUnion('kind',[
 z.object({id:idSchema,kind:z.literal('view'),viewId:idSchema}).strict(),
 z.object({id:idSchema,kind:z.literal('form'),formId:idSchema}).strict(),
 z.object({id:idSchema,kind:z.literal('text'),text:z.string().max(5000)}).strict(),
 z.object({id:idSchema,kind:z.literal('divider')}).strict(),
])
export const definitionSchema=z.object({
 appId:idSchema,name:label,
 pages:z.array(z.object({id:idSchema,title:label,sections:z.array(z.object({id:idSchema,title:label,tab:z.string().trim().max(80),components:z.array(interfaceComponent).min(1).max(20)}).strict()).min(1).max(12)}).strict()).min(1).max(8),
 audience:z.object({roles:z.array(z.enum(baseRoles)).max(5),people:z.array(idSchema).max(200)}).strict(),
}).strict().superRefine((input,ctx)=>{
 const ids=input.pages.flatMap(page=>[page.id,...page.sections.flatMap(section=>[section.id,...section.components.map(component=>component.id)])])
 if(new Set(ids).size!==ids.length)ctx.addIssue({code:'custom',message:'Pages, sections and components need distinct identities.'})
 if(new Set(input.audience.roles).size!==input.audience.roles.length||new Set(input.audience.people).size!==input.audience.people.length)ctx.addIssue({code:'custom',message:'Interface audience entries must be distinct.'})
 if(ids.length>500)ctx.addIssue({code:'custom',message:'This interface exceeds the bounded page and component capacity.'})
})
export const interfaceInput=definitionSchema
export const publishInterfaceInput=z.object({commandId:idSchema,id:idSchema.optional(),version:z.number().int().positive().optional(),definition:definitionSchema}).strict().superRefine((input,ctx)=>{
 if(!input.definition.audience.roles.length&&!input.definition.audience.people.length)ctx.addIssue({code:'custom',path:['definition','audience'],message:'Choose at least one audience role or person.'})
})
export type InterfaceInput=z.infer<typeof definitionSchema>
export type InterfaceDefinition=InterfaceInput&{id:string;version:number;authorId:string|null;createdAt:string;updatedAt:string;canEdit:boolean}
export type InterfaceComponent=z.infer<typeof interfaceComponent>
export const RECORD_INTERFACE_ENTITY_ID='00000000000000000000000004'
