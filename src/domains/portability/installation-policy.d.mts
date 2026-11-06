import type {ArchivePolicy,Manifest} from '@runeditrun/rer/modules/portability';
export const portabilityPolicy: ArchivePolicy;
export const transient: string[];
export function installationPortabilityPolicy(warehouse: R2Bucket): ArchivePolicy;
export function archivePolicyFor(manifest:Manifest,input:ArchivePolicy):ArchivePolicy;
