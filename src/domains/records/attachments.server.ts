import type { Ref } from '../../contracts/primitives';
import type { RequestContext } from '../authority/ports';
import type { SqlPredicate, SqlMutation } from '../admission/ports';
export type PreparedAttachmentCopy = { fileId:string; guards:SqlPredicate[]; mutations:SqlMutation[]; discard():Promise<void> }
export type RecordAttachmentPort = {
    readable(ctx: RequestContext, fileId: string, subject: Ref, fieldId: string): Promise<boolean>;
    prepareLink(ctx: RequestContext, fileId: string, subject: Ref, fieldId: string): Promise<SqlPredicate[]>;
    prepareCopy?(ctx:RequestContext,fileId:string,source:Ref,target:Ref,fieldId:string):Promise<PreparedAttachmentCopy>;
};
