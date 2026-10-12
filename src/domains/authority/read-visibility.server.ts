import {AuthorityError} from './errors'

/** An identifier is not permission to learn that a private resource exists.
 * Preserve operational faults and session errors; conceal only scope refusals. */
export async function visibleRead<T>(message:string,authorize:()=>Promise<T>):Promise<T>{
 try{return await authorize()}
 catch(error){
  if(error instanceof AuthorityError&&['forbidden','grant_revoked','grant_expired'].includes(error.code))
   throw new AuthorityError('not_found',message,404)
  throw error
 }
}
