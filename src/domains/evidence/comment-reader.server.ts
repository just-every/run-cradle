import type {Ref} from '../../contracts/primitives';
import type {RequestContext} from '../authority/ports';
import type {DescriptorRegistry} from '../records/descriptors.server';
import type {EvidenceDependencies} from './ports';
import {and,identifier,trustedPredicate} from '../admission/sql.server';
import {createCursorCodec} from '../records/cursor.server';
import {ApiError} from '../../core/registry/errors';
import {AuthorityError} from '../authority/errors';
import {assertCurrentScopeAuthority} from '../authority/guards.server';

type CommentRow={id:string;version:number;created_at:string;updated_at:string;author_id:string;author_kind:string;body:string|null;mentions_json:string;deleted_at:string|null;author_label:string|null;author_name:string|null};
export function createCommentReader(deps:EvidenceDependencies,registry:DescriptorRegistry,cursorSecret:string){
 const cursor=createCursorCodec(cursorSecret);
 return async(ctx:RequestContext,subject:Ref,options:{limit:number;q?:string;cursor?:string})=>{
  await deps.access.checkReference(ctx,subject,[],'read');
  const scope=await deps.policy.scope(ctx,{appId:subject.appId,entityId:subject.entityId,purpose:'read'}),d=registry.get(subject.appId,subject.entityId),q=options.q??'';
  // The row predicate already contains its authority fence. Repeating the
  // delegated-principal tree inside each EXISTS exceeds D1's expression depth.
  const current=scope.rowPredicate,record=await deps.db.prepare(`SELECT ${identifier(d.versionColumn)} AS version FROM ${identifier(d.table.tableId)} WHERE ${identifier(d.idColumn)}=? AND (${current.sql})`).bind(subject.recordId,...current.values).first<{version:number}>();
  if(!record)throw new ApiError('forbidden','Current record access is required.');
  const can=async(action:string)=>{try{await deps.policy.authorize(ctx,{appId:subject.appId,action,expected:[{ref:subject,version:record.version}],cost:[],inputHash:''});return true}catch(error){if(!(error instanceof AuthorityError))throw error;return false}};
  const [canAdd,canEdit,canDelete]=await Promise.all(['comment.add','comment.edit','comment.delete'].map(can));
  const revision=(await deps.db.prepare("SELECT COALESCE(MAX(rowid),0) n FROM command_admissions WHERE state='committed'").first<{n:number}>())!.n,binding=await cursor.binding({subject,principal:ctx.principal.id,policy:scope.policyVersion,limit:options.limit,q});
  let offset=0;if(options.cursor){const decoded=await cursor.decode(options.cursor);if(decoded.binding!==binding||decoded.revision!==revision)throw new ApiError('stale_cursor','Comments changed; reload the first page.');offset=decoded.offset;}
  const where=and(trustedPredicate('c.app_id=? AND c.entity_id=? AND c.record_id=?',[subject.appId,subject.entityId,subject.recordId]),trustedPredicate(`EXISTS(SELECT 1 FROM ${identifier(d.table.tableId)} WHERE ${identifier(d.idColumn)}=? AND (${current.sql}))`,[subject.recordId,...current.values]),...(q?[trustedPredicate('c.deleted_at IS NULL AND instr(lower(c.body),lower(?))>0',[q])]:[]));
  const rows=(await deps.db.prepare(`SELECT c.*,o.name AS author_name FROM evidence_comments c LEFT JOIN authority_principals p ON p.id=c.author_id LEFT JOIN operators o ON o.id=COALESCE(p.human_id,c.author_id) WHERE ${where.sql} ORDER BY c.created_at,c.id LIMIT ? OFFSET ?`).bind(...where.values,options.limit,offset).all<CommentRow>()).results;
  const total=(await deps.db.prepare(`SELECT count(*) n FROM evidence_comments c WHERE ${where.sql}`).bind(...where.values).first<{n:number}>())!.n;
  const mentioned=[...new Set(rows.flatMap(r=>JSON.parse(r.mentions_json) as string[]))],people=mentioned.length?(await deps.db.prepare('SELECT id,name FROM operators WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(mentioned)).all<{id:string;name:string}>()).results:[],names=new Map(people.map(person=>[person.id,person.name]));
  await assertCurrentScopeAuthority(deps.db,ctx,scope);
  await deps.access.checkReference(ctx,subject,[],'read');
  return {items:rows.map(r=>{const own=r.author_id===ctx.principal.id&&r.author_kind===ctx.principal.kind,mentions=JSON.parse(r.mentions_json) as string[];return {id:r.id,version:r.version,createdAt:r.created_at,updatedAt:r.updated_at,subject,author:{id:r.author_id,kind:r.author_kind},authorLabel:r.author_label??r.author_name??r.author_kind,body:r.body,mentions,mentionLabels:mentions.flatMap(id=>names.has(id)?[{id,name:names.get(id)!}]:[]),edited:r.version>1&&!r.deleted_at,deletedAt:r.deleted_at,canEdit:own&&!r.deleted_at&&canEdit===true,canDelete:own&&!r.deleted_at&&canDelete===true}}),canAdd:canAdd??false,nextCursor:offset+rows.length<total?await cursor.encode({binding,revision,offset:offset+rows.length}):null,total:{kind:total>10000?'at_least' as const:'exact' as const,value:Math.min(total,10000)},evaluatedAt:ctx.now};
 };
}
