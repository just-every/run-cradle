import type { Ref } from '../../contracts/primitives';
import type { RequestContext } from '../authority/ports';
import type { SqlPredicate } from '../admission/ports';
export type RecordAttachmentPort = {
    readable(ctx: RequestContext, fileId: string, subject: Ref, fieldId: string): Promise<boolean>;
    prepareLink(ctx: RequestContext, fileId: string, subject: Ref, fieldId: string): Promise<SqlPredicate[]>;
};
