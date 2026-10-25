// AUTO-007 offsets from the first confirmed safe refusal; never from the last retry.
const retrySeconds=[60,300,900,1800,3600] as const
export function notificationRetryAt(firstFailureAt:number,attempts:number):number|null{
 const seconds=retrySeconds[attempts-1]
 return seconds===undefined?null:firstFailureAt+seconds*1000
}
