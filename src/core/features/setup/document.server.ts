import { env } from 'cloudflare:workers'
import { getRequest, setResponseHeader } from '@tanstack/react-start/server'
import { redirect } from '@tanstack/react-router'
import { createPlatform } from '../../platform'
import { createProductAuth } from '../../../domains/authority/product-auth.server'
import { firstRunResponse } from './server'

export async function setupDocument() {
  setResponseHeader('cache-control','private, no-store')
  const platform=createPlatform(env)
  const request=getRequest()
  // Server-function transport has its own URL. Admit the document it serves
  // through the same native GET guard as a direct request to /setup.
  const admission=await firstRunResponse(new Request(new URL('/setup',request.url),{headers:request.headers}),platform)
  if(admission){
    const location=admission.headers.get('location')
    if(location){
      const destination=new URL(location,request.url)
      throw redirect({href:destination.pathname+destination.search})
    }
    throw new Error('The first owner must complete setup.')
  }
  const csrf=await createProductAuth(platform.database.$client,platform.auth.configuration).csrf(request)
  const workspace=await platform.database.$client.prepare("SELECT name,timezone,currency FROM workspace WHERE id='workspace'").first<{name:string;timezone:string;currency:string}>()
  if (!workspace) throw new Error('Workspace is unavailable.')
  return {csrf,workspace}
}
