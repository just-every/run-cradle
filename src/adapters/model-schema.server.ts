/** Validate the supported strict Responses schema subset before spending a call. */
export function assertStructuredSchema(schema:Record<string,unknown>,depth=0):void {
 if(depth>32)throw new Error('Model schema nesting exceeds limit');
 if(schema.type==='object'){
  if(schema.additionalProperties!==false||!schema.properties||typeof schema.properties!=='object'||Array.isArray(schema.properties)||!Array.isArray(schema.required))throw new Error('Model objects must be closed and all properties required');
  const keys=Object.keys(schema.properties);if(keys.length>200||schema.required.length!==keys.length||!keys.every(k=>(schema.required as unknown[]).includes(k)))throw new Error('Model required fields must match properties');
  for(const value of Object.values(schema.properties)){if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid model property schema');assertStructuredSchema(value as Record<string,unknown>,depth+1);}
 }else if(schema.type==='array'){if(!schema.items||typeof schema.items!=='object'||Array.isArray(schema.items))throw new Error('Model array items require schema');assertStructuredSchema(schema.items as Record<string,unknown>,depth+1);}
 else if(Array.isArray(schema.anyOf)){for(const part of schema.anyOf){if(!part||typeof part!=='object')throw new Error('Invalid model schema union');assertStructuredSchema(part,depth+1);}}
 else if(!['string','number','integer','boolean','null'].includes(String(schema.type))&&!Array.isArray(schema.type))throw new Error('Unsupported model schema type');
}
