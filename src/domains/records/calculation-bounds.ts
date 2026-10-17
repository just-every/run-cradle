/** Bound untrusted recursive ASTs before Zod descends into them. */
export function assertCalculationBounds(input: unknown): void {
  if(!input||typeof input!=='object'||!('tables' in input)||!Array.isArray(input.tables))return
  for(const table of input.tables){if(!table||typeof table!=='object'||!Array.isArray(table.fields))continue
    for(const field of table.fields){if(!field||typeof field!=='object'||!field.expression)continue
      const pending=[{node:field.expression,depth:1}];let count=0
      while(pending.length){const {node,depth}=pending.pop()!;if(depth>64||++count>4096)throw new Error(`${String(field.label??'Calculation')}: expression exceeds depth 64 or 4,096 nodes`)
        if(!node||typeof node!=='object')continue
        if(node.kind==='call'&&Array.isArray(node.args))for(const arg of node.args)pending.push({node:arg,depth:depth+1})
        if(node.kind==='rollup'&&node.filter)pending.push({node:node.filter,depth:depth+1})
        if(Array.isArray(node.conditions))for(const condition of node.conditions)pending.push({node:condition,depth:depth+1})
      }
    }
  }
}
