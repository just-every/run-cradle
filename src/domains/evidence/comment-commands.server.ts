import {z} from 'zod';
import type {Json} from '../../contracts/primitives';
import type {CommandRegistry} from '../../core/registry/commands';
import {id,ref} from './validators';
import {commentIdentity,type createCommentService} from './comments.server';

const content=z.object({subject:ref,body:z.string().min(1).max(10000).refine(body=>Boolean(body.trim()),'Comment text is required.'),mentions:z.array(id).max(100).refine(ids=>new Set(ids).size===ids.length,'Mentions must be distinct.')}).strict();
const target=z.object({subject:ref,id,version:z.number().int().positive()}).strict();
const envelope=<T extends z.ZodType>(input:T)=>z.object({commandId:id,expected:z.array(z.object({ref,version:z.number().int().positive()}).strict()).length(1),input}).strict();
export function registerCommentCommands(registry:CommandRegistry,comments:ReturnType<typeof createCommentService>){
 const add=envelope(content),edit=envelope(target.extend({body:content.shape.body,mentions:content.shape.mentions})),remove=envelope(target);
 registry.register({action:'comment.add',description:'Add a record comment and notify mentioned readers.',input:add,inputSchema:z.toJSONSchema(add) as Json,visible:async()=>true,replayIdentity:async(_ctx,c)=>({appId:c.input.subject.appId,canonicalInputHash:await commentIdentity('comment.add',c)}),prepare:comments.prepareAdd});
 registry.register({action:'comment.edit',description:'Edit your own record comment.',input:edit,inputSchema:z.toJSONSchema(edit) as Json,visible:async()=>true,replayIdentity:async(_ctx,c)=>({appId:c.input.subject.appId,canonicalInputHash:await commentIdentity('comment.edit',c)}),prepare:comments.prepareEdit});
 registry.register({action:'comment.delete',description:'Delete your own record comment.',input:remove,inputSchema:z.toJSONSchema(remove) as Json,visible:async()=>true,replayIdentity:async(_ctx,c)=>({appId:c.input.subject.appId,canonicalInputHash:await commentIdentity('comment.delete',c)}),prepare:comments.prepareRemove});
}
