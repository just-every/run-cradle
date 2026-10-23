import { z } from 'zod';
import { ProviderTransport } from '../../adapters/transport.server';
import type { FileStoreProvider } from './oauth.server';
/** Identity is asserted by the consenting provider, never by the person's configure input. */
export async function storeAccountIdentity(provider:FileStoreProvider,token:string,transport=new ProviderTransport()){
 const route={ 'google-drive':'drive.root',onedrive:'graph.drive',dropbox:'dropbox.account',box:'box.account'} as const;
 const response=await transport.request(route[provider],{headers:{authorization:`Bearer ${token}`},...(provider==='dropbox'?{body:null}:{}),deadline:new Date(Date.now()+15000).toISOString()});
 if(response.status!==200)throw new Error('The file store did not provide its account identity.');
 const opaque=z.string().min(1).max(512);
 if(provider==='dropbox')return z.object({root_info:z.object({root_namespace_id:opaque})}).parse(response.body).root_info.root_namespace_id;
 return z.object({id:opaque}).parse(response.body).id;
}
