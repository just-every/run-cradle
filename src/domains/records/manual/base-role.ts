export const baseRoles = ['owner','creator','editor','commenter','read-only'] as const
export type BaseRole = typeof baseRoles[number]
export type BaseAccess = {role:BaseRole|null;canManage:boolean;canAdopt:boolean;canDestruct:boolean}
export type BaseCollaborator = {id:string;name:string;email:string|null;role:BaseRole|null;destructive:boolean;version:number;originalOwner:boolean}
