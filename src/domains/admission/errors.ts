import type { ErrorCode } from '../../contracts/primitives';
export class AdmissionError extends Error {
    constructor(public readonly code: ErrorCode, message: string, public readonly currentVersion?: number) { super(message); this.name = 'AdmissionError'; }
}
