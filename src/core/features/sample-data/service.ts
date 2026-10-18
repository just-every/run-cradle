import type { Platform } from '../../platform'
import { executeLegacy } from '../../../apps/launch/legacy.server'
/** Samples are an explicit operator command; sign-in and ordinary reads never install them. */
export const createSampleDataService=(platform:Platform)=>({
 install:(request:Request)=>executeLegacy(platform,request,'samples.install',{}),
})
