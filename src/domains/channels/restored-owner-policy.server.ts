import type {Policy} from '../authority/contracts'
import {CHANNEL_ENTITIES,CHANNEL_FIELDS} from './setup.server'
import {CHANNEL_APP} from './settings.server'

/** Restore rebinds only the exact private channel self-scope. Business row
 * ownership, other recipients and all other policy predicates remain history. */
export function restoredChannelSelfScope(rule:Policy['rules'][number],appId:string,source:string|null,owner:string):Policy['rules'][number]{
 if(appId!==CHANNEL_APP||![CHANNEL_ENTITIES.personal,CHANNEL_ENTITIES.notification].some(id=>id===rule.entityId)
  ||rule.principals.length!==1||rule.principals[0]?.kind!=='human'||rule.principals[0].id!==source
  ||rule.rows.kind!=='condition'||rule.rows.fieldId!==CHANNEL_FIELDS.owner||rule.rows.op!=='eq'||rule.rows.value!==source)return rule
 return {...rule,rows:{...rule.rows,value:owner}}
}
