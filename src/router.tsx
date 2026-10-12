import {installCompiledLiveEdits,setLiveEditsReady} from './editor'
import compiled from './editor/visual-edits.json'
import { createRouter } from '@tanstack/react-router'
import { DocumentError } from './core/app/ui/document-failure'
import { routeTree } from './routeTree.gen'
import { getClientExtensionConfig } from './core/app/mount-client'

if(typeof document!=='undefined'){
 setLiveEditsReady(false)
 installCompiledLiveEdits(compiled)
}
export function getRouter() {
  const router = createRouter({ routeTree, context: { config: getClientExtensionConfig() }, scrollRestoration: true, defaultErrorComponent: DocumentError })
  router.subscribe('onBeforeNavigate',()=>{if(typeof document!=='undefined')setLiveEditsReady(false)})
  return router
}

declare module '@tanstack/react-router' {
  interface Register { router: ReturnType<typeof getRouter> }
}
