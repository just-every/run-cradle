import path from 'node:path'

/** Observe fetch options inside workerd before its outbound service serializes them. */
export function mailEdgeEntry(main) {
 return {type:'ESModule',path:path.join(path.dirname(main),'__mail_edge_entry__.mjs'),contents:`
  import actual, {InstallationCoordinator} from './${path.basename(main)}';
  export {InstallationCoordinator};
  const network=globalThis.fetch;
  globalThis.fetch=(input,init={})=>{
   const headers=new Headers(init.headers??(input instanceof Request?input.headers:undefined));
   headers.set('x-test-redirect-mode',init.redirect??(input instanceof Request?input.redirect:'follow'));
   return network(input,{...init,headers});
  };
  export default actual;
 `}
}
