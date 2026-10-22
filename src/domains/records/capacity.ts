export const recordLimits={recordsPerTable:250000,recordsPerBase:500000,fieldsPerTable:500,tablesPerBase:50} as const
export const capacityMessage=(name:keyof typeof recordLimits,current:number)=>`LIMIT ${name} value ${recordLimits[name]} CURRENT ${current}. Reduce the base or table before adding more.`
