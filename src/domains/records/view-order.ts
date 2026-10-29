/** Legacy views keep their stable identity order until someone assigns a list order. */
export function compareViewOrder(a:{id:string;position?:number},b:{id:string;position?:number}){
 return (a.position??1000)-(b.position??1000)||(a.id<b.id?-1:a.id>b.id?1:0)
}
