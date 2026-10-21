export const userSchema='urn:ietf:params:scim:schemas:core:2.0:User'
export const listSchema='urn:ietf:params:scim:api:messages:2.0:ListResponse'
export const errorSchema='urn:ietf:params:scim:api:messages:2.0:Error'
export const patchSchema='urn:ietf:params:scim:api:messages:2.0:PatchOp'
const attribute=(name:string,type:string,required=false)=>({name,type,multiValued:false,required,caseExact:false,mutability:'readWrite',returned:'default',uniqueness:name==='userName'?'server':'none'})
export const schema={schemas:['urn:ietf:params:scim:schemas:core:2.0:Schema'],id:userSchema,name:'User',description:'Cradle operator',attributes:[attribute('userName','string',true),attribute('displayName','string'),attribute('active','boolean'),{...attribute('name','complex'),subAttributes:[attribute('givenName','string'),attribute('familyName','string')]},attribute('externalId','string')]}
export const resourceType={schemas:['urn:ietf:params:scim:schemas:core:2.0:ResourceType'],id:'User',name:'User',endpoint:'/Users',schema:userSchema,schemaExtensions:[]}
export const providerConfig={schemas:['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],patch:{supported:true},bulk:{supported:false,maxOperations:0,maxPayloadSize:0},filter:{supported:true,maxResults:200},changePassword:{supported:false},sort:{supported:false},etag:{supported:false},authenticationSchemes:[{type:'oauthbearertoken',name:'Owner-issued bearer credential',description:'A rotatable credential issued in Sign-in settings',primary:true}]}
