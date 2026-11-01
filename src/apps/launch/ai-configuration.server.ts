/**
 * Names the declared installation values (seed.json env) that the default
 * ai.provider.v1 adapter still lacks; a blank value counts as missing. Only names
 * leave this function, never a value. The demo serves its own deterministic
 * analysis and needs neither. AI stays off while any name is returned (SET-002).
 */
export function missingAiConfiguration(env:{AI_PROVIDER_API_KEY?:string;AI_MODEL?:string;RER_DEMO?:string}):string[]{
 if(env.RER_DEMO==='1')return []
 return [...(env.AI_PROVIDER_API_KEY?.trim()?[]:['AI_PROVIDER_API_KEY']),...(env.AI_MODEL?.trim()?[]:['AI_MODEL'])]
}
