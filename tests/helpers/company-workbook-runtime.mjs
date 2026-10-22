import {recordsImportBrowserRuntime} from './records-import-browser-runtime.mjs'
import {sheetsProvider} from './sheets-provider.mjs'
export async function companyWorkbookRuntime(port){const provider=sheetsProvider(),h=await recordsImportBrowserRuntime(port,{outbound:request=>provider.fetch(request),bindings:{GOOGLE_CLIENT_ID:'synthetic-cradle-client-1',GOOGLE_CLIENT_SECRET:'synthetic-cradle-client-secret-1',CONNECTION_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')}});return {...h,sheetsProvider:provider}}
