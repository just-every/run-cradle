import type {Freshness,Impact,Page,AllowedAction} from '../../contracts/primitives';
export type TodayBucket='needs_decision'|'being_handled'|'finished';
export type TodayItem={id:string;bucket:TodayBucket;appId:string;caseId:string|null;decisionId:string|null;title:string;recommendation:string|null;status:string;impact:Impact;freshness:Freshness;nextStep:string;dueAt:string|null;verifiedAt:string|null;link:string;allowedActions:AllowedAction[]};
export type Today={buckets:Record<TodayBucket,Page<TodayItem>>;materialOutages:{capabilityId:string;capabilityLabel:string|null;affectedCases:number;accountableId:string;accountableLabel:string|null;nextStep:string;link:string}[]};
