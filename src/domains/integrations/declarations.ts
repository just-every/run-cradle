import { declareEgress } from '../../../vendor/base/modules/integrations/egress/declaration.ts'
export const recordWebhookEgress=declareEgress({id:'record-webhooks',required:false,
 requiredWhen:'A user enables a signed record webhook action',
 provider:{id:'owner-receiver',name:'Owner-selected receiver'},
 destination:{kind:'custom',id:'record-automation-destination',description:'An immutable encrypted public HTTPS receiver'},
 why:'The receiver belongs to the owner or their service; Cradle cannot perform its external action.',
 dataFields:['Record reference identifiers','record event and version','delivery identity','signature and timestamp'],
 adapters:['automation.egress.v1'],custody:[
  {name:'EGRESS_RELAY_SECRET',purpose:'Authenticate Cradle to its trusted egress relay'},
  {name:'CONNECTION_ENCRYPTION_KEY',purpose:'Encrypt private destination URLs and webhook signing keys'},
 ]})
export const slackEgress=declareEgress({id:'automation-slack',required:false,
 requiredWhen:'A user enables a Slack automation action',provider:{id:'slack',name:'Slack'},
 destination:{kind:'provider',id:'incoming-webhook',description:'An immutable encrypted Slack incoming webhook'},
 why:'Slack owns the selected workspace and message delivery.',dataFields:['Owner-approved literal message text'],
 adapters:['automation.egress.v1'],custody:[]})
