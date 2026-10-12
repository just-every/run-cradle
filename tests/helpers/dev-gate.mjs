import {randomBytes} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'

/**
 * The local dev key gate for tests. Workers a test starts itself receive one random key
 * per test run as RER_DEV_KEY (children inherit it through the environment) and
 * present it in the same header rer's harness uses. A checkout that rer set up has
 * its own key in .rer/local/dev-key.env.
 */
process.env.CRADLE_TEST_DEV_KEY??=randomBytes(32).toString('base64url')
export const testDevKey=process.env.CRADLE_TEST_DEV_KEY
export const devKeyHeader=key=>({'x-rer-dev-key':key??testDevKey})
export const withDevKey=(init={},key)=>({...init,headers:{...init.headers,...devKeyHeader(key)}})
export async function checkoutDevKey(root){
 const key=/^RER_DEV_KEY=(\S+)$/m.exec(await readFile(join(root,'.rer/local/dev-key.env'),'utf8'))?.[1]
 if(!key)throw new Error('rer setup has not written this checkout\'s dev key')
 return key
}
/** The cookie a browser holds after the RER_OPEN key exchange; lets a test context open the outbox. */
export async function gateCookie(origin,key){
 const response=await fetch(origin+'/__dev/key',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({key})})
 if(response.status!==204)throw new Error('The dev key exchange was refused ('+response.status+')')
 const [pair]=response.headers.get('set-cookie').split(';'),separator=pair.indexOf('=')
 return {name:pair.slice(0,separator),value:pair.slice(separator+1),url:origin,httpOnly:true,sameSite:'Strict'}
}
