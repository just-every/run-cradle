import type { Id, Instant, Money, Json } from '../../contracts/primitives';
import type { RequestContext } from '../authority/ports';
import type { ModelCall } from './contracts';
export type ModelSourceRef={id:Id;version:number;sha256:string;ownerAppId:Id;effectiveAt:Instant|null;knownAt:Instant;sourceReleaseId:Id|null};
export type ModelContextArtifact={id:Id;sha256:string;purpose:string;sourceRefs:ModelSourceRef[];fieldIds:Id[];expiresAt:Instant;providerDestination:string};
export type ModelTask<I>={requestId?:Id;purpose:string;profileId:Id;context:ModelContextArtifact;input:I;outputSchemaId:string;outputSchemaVersion:number;maximumCost:Money;deadline:Instant};
export interface ModelPort {generate<I,O>(ctx:RequestContext,task:ModelTask<I>,validate:(value:unknown)=>O):Promise<{value:O;call:ModelCall;sourceRefs:ModelSourceRef[]}>}
export type ModelSchema={schema:Record<string,Json>;instructions:string;validate(value:unknown,sourceIds:readonly string[]):Json};
