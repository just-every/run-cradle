/** Vite embeds the digest of the actual launch/runtime source inputs in this Worker. */
declare const __LAUNCH_SOURCE_RELEASE__:string
export const launchSourceRelease=(configured?:string)=>configured?.trim()||(typeof __LAUNCH_SOURCE_RELEASE__==='undefined'?undefined:__LAUNCH_SOURCE_RELEASE__)
