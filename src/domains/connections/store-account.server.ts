import { z } from 'zod';
import { ProviderTransport } from '../../adapters/transport.server';
import type { FileStoreProvider } from './oauth.server';
/** Identity is asserted by the consenting provider, never by the person's configure input. */
export async function storeAccountIdentity(provider:Exclude<FileStoreProvider,'dropbox'>,token:string,transport=new ProviderTransport()){
 const route={ 'google-drive':'drive.root',onedrive:'graph.drive',box:'box.account'} as const;
 const response=await transport.request(route[provider],{headers:{authorization:`Bearer ${token}`},deadline:new Date(Date.now()+15000).toISOString()});
 if(response.status!==200)throw new Error('The file store did not provide its account identity.');
 const opaque=z.string().min(1).max(512);
 return z.object({id:opaque}).parse(response.body).id;
}
