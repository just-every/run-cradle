import {AuthorityError} from '../authority/errors'
import {resyncMessage} from './schema'
export function resyncRange(from:string,through:string){return {code:'resync_required' as const,message:resyncMessage,from,through}}
export class CursorExpired extends AuthorityError {
 constructor(public readonly resyncRequired:ReturnType<typeof resyncRange>){super('cursor_expired','Change cursors are retained for 30 days; resynchronize the scope.',410)}
}
