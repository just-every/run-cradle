import type { ImprovementScorecard } from './contracts';
function decimal(value:string):[bigint,bigint]{if(!/^-?\d+(?:\.\d+)?$/.test(value))throw new Error('invalid_metric_decimal');const [whole,fraction='']=value.split('.');return[BigInt(`${whole}${fraction}`),10n**BigInt(fraction.length)];}
export function greater(a:string,b:string){const [an,ad]=decimal(a),[bn,bd]=decimal(b);return an*bd>bn*ad;}
export function assessScorecard(score:ImprovementScorecard,floors:{metric:string;maximum:string}[]):{state:'passed'|'regressed'|'inconclusive';reasons:string[]}{
 const reasons:string[]=[];
 if(score.eligible<=0||[score.open,score.failed,score.abandoned,score.cancelled,score.rightCensored].some(n=>!Number.isInteger(n)||n<0||n>score.eligible))return{state:'inconclusive',reasons:['invalid_exposure_denominator']};
 if((score.open>0||score.rightCensored>0)&&floors.some(f=>['human_minutes','lead_time','cost'].includes(f.metric)))reasons.push('followup_window_incomplete');
 let regression=false;
 for(const floor of floors){const metrics=score.metrics.filter(m=>m.name===floor.metric);if(!metrics.length){reasons.push(`missing_${floor.metric}`);continue;}for(const metric of metrics){if(metric.value===null||metric.denominator===null||metric.denominator==='0'||metric.missing>0){reasons.push(`unobserved_${floor.metric}`);continue;}if(greater(metric.value,floor.maximum)){regression=true;reasons.push(`regressed_${floor.metric}_${metric.role??'all'}`);}}}
 if(!floors.some(f=>f.metric==='human_minutes'))reasons.push('human_burden_floor_missing');
 return{state:regression?'regressed':reasons.length?'inconclusive':'passed',reasons};
}
