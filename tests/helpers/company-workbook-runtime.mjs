import {recordsImportBrowserRuntime} from './records-import-browser-runtime.mjs'
import {sheetsProvider} from './sheets-provider.mjs'
import {fileStoresProvider} from './file-stores-provider.mjs'
import {fileStoreBindings} from './file-stores-journey.mjs'
// One outbound edge for both fakes: the file stores use their own consent code.
export async function companyWorkbookRuntime(port){const provider=sheetsProvider(),stores=fileStoresProvider(),route=async request=>{const u=new URL(request.url),code=u.pathname.endsWith('/token')?new URLSearchParams(await request.clone().text()).get('code'):null;return u.hostname==='sheets.googleapis.com'||code==='synthetic-cradle-code-1'?provider.fetch(request):stores.fetch(request)}
 const h=await recordsImportBrowserRuntime(port,{outbound:route,bindings:fileStoreBindings});return {...h,sheetsProvider:provider,fileStoresProvider:stores}}
