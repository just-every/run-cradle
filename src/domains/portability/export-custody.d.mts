import type {Portability} from '@runeditrun/rer/modules/portability';
export function quoteCopy(name:string):string;
export function copyOwner(name:string):string|undefined;
export function retirementTrigger(owner:string):string;
export function jobOwner(id:string):string|undefined;
export function ownedCopies(row:{id:string;metadata:string}):string[];
export function compactExport(db:D1Database,service:Portability,id:string):Promise<void>;
export function retainedExports(db:D1Database,service:Portability):Portability;
