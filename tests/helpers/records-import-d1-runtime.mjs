import './typescript-loader.mjs'
import {Miniflare,convertV4MiniflareOptions} from 'miniflare'
import {migrationInventory} from '../../scripts/migration-groups.mjs'
export async function openImportD1(directory,initialize=false){
 const config=convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-09-07',d1Databases:{DB:'native-import'},resourcePersistencePath:directory})
 for(const worker of config.workers)if(worker.dev)worker.dev.unsafeRegisterWorker=false
 const runtime=new Miniflare(config)
 try{const db=await runtime.getD1Database('DB');if(initialize){for(const {sql} of migrationInventory())await db.exec(sql.replace(/^--.*$/gm,'').replaceAll('\n',' '))}return {db,close:()=>runtime.dispose()}}catch(error){await runtime.dispose();throw error}
}
