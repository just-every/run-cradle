/** Strict bounded CSV: comma delimiter, optional UTF-8 BOM, quoted RFC4180 cells. */
export function parseCsv(bytes:Uint8Array):{headers:string[];rows:string[][]}{
 if(bytes.byteLength>10*1024*1024)throw new Error('CSV exceeds 10MB');let text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(text.startsWith('\uFEFF'))text=text.slice(1);if(!text.length||text.includes('\0'))throw new Error('CSV requires a header');
 const rows:string[][]=[];let row:string[]=[],cell='',quoted=false,closed=false,started=false;
 const field=()=>{row.push(cell);cell='';closed=false;started=false;};const record=()=>{field();rows.push(row);row=[];if(rows.length>10001)throw new Error('CSV exceeds 10000 rows');};
 for(let i=0;i<text.length;i++){const c=text[i]!;if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}if(c==='"'){if(started||closed)throw new Error('Unexpected CSV quote');quoted=true;started=true;continue;}if(c===','){field();continue;}if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]!=='\n')throw new Error('CSV requires LF or CRLF');if(c==='\r')i++;record();continue;}if(closed)throw new Error('Characters after closing CSV quote');cell+=c;started=true;}
 if(quoted)throw new Error('Unterminated CSV quote');if(started||closed||row.length)record();const headers=rows.shift()!;if(headers.some(h=>!h.trim())||new Set(headers).size!==headers.length)throw new Error('CSV headers must be nonempty and unique');if(rows.some(r=>r.length!==headers.length))throw new Error('CSV row width differs from header');return{headers,rows};
}
export function encodeCsvRecord(row:(string|number|null)[]):string{return row.map(value=>'"'+String(value??'').replaceAll('"','""')+'"').join(',')+'\r\n'}
export function encodeCsv(headers:string[],rows:(string|number|null)[][]){return [headers,...rows].map(encodeCsvRecord).join('')}
