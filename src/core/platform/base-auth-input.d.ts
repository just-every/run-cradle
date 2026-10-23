declare module '*vendor/base/modules/operator-auth/input.mjs' {
 export function readInput(request:Request):Promise<Record<string,unknown>>
}

declare module '*vendor/base/modules/operator-auth/page.mjs' {
 export function pageResponse(input:{branding:import('../../../vendor/base/modules/operator-auth/index.mjs').AuthPresentation;title?:string;heading:string;content:string;status?:number;referrer?:string}):Promise<Response>
}
declare module '*vendor/base/modules/operator-auth/http.mjs' {
 export function requirePost(request:Request,config:{origin:string;local:boolean}):void
 export function escapeHtml(value:string):string
}
