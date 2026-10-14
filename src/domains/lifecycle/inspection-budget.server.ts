/** One fixed memory budget per inspected attachment. Every decoded buffer and every
 * text copy kept for matching is charged before it is created; exceeding it refuses
 * the attachment instead of growing the Worker toward its isolate memory limit. */
export const INSPECTION_BUDGET=32*1024*1024
// Charged for every kept string on top of its characters (object header and slot).
const SLOT=16
export class InspectionBudget{
 private used=0
 get left(){return Math.max(0,INSPECTION_BUDGET-this.used)}
 charge(units:number){this.used+=units;if(this.used>INSPECTION_BUDGET)throw new Error('attachment exceeds the inspection memory budget')}
 /** Charges an upper bound of a string's length before it is built. */
 build(length:number,make:()=>string){this.charge(length+SLOT);return make()}
 // A loop, not push(...values): a document can hold more strings than call arguments allow.
 keep(out:string[],values:readonly string[]){for(const value of values){this.charge(value.length+SLOT);out.push(value)}}
}
