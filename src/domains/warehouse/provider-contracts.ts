/** Durable delivery metadata contains identifiers and schema, never credentials
 * or copied values. It remains with each exported object until erasure confirms. */
export type WarehouseObjectMeta={headers:string[];columnTypes:('STRING'|'DOUBLE'|'BOOLEAN')[];recordIds:string[];sourceTable:string;schemaHash:string;format:'csv'|'parquet';columns?:{fieldId:string;label:string;column:string}[]}
export type WarehouseRemoteDestination={prepare?(key:string,meta:WarehouseObjectMeta):Promise<void>;write(key:string,body:Uint8Array<ArrayBuffer>,meta:WarehouseObjectMeta):Promise<void>;erase(key:string,meta:WarehouseObjectMeta):Promise<void>}
export type WarehouseStage={put(key:string,body:string|ArrayBuffer,options:{httpMetadata:{contentType:string}}):Promise<unknown>;get(key:string):Promise<{arrayBuffer():Promise<ArrayBuffer>}|null>;head(key:string):Promise<unknown|null>;delete(key:string):Promise<unknown>}
