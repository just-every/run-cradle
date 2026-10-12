/** Legacy collection envelope, preserving ordered IDs and bounding every page. */
export function launchCollection<T>(items:T[],cursor:string|undefined,limitText:string|undefined){
 const offset=cursor===undefined?0:Number(cursor),limit=limitText===undefined?200:Number(limitText)
 if(!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>200)throw new Error('Invalid page cursor or limit')
 const page=items.slice(offset,offset+limit),total=Math.min(items.length,10000)
 return{items:page,cursor:offset+limit<items.length?String(offset+limit):null,total,totalLabel:items.length>10000?'10,000+':String(total),shown:page.length}
}
