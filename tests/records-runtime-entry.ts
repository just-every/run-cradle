export * from '../src/domains/records/descriptors.server';
export * from '../src/domains/records/service.server';
export * from '../src/domains/records/validators';
export * from '../src/domains/records/exact';
export * from '../src/domains/records/formulas';
export * from '../src/domains/records/migration.server';
export * from '../src/domains/records/contracts';
export * from '../src/domains/admission/sql.server';
export * from '../src/domains/admission/service.server';
export * from '../src/domains/admission/canonical';
export * from '../src/core/shared/ids';
export * from '../src/domains/records/actions.server';
export * from '../src/core/registry/commands';
export * from '../src/core/registry/http';
export * from '../src/core/registry/mcp';

export { AdmissionError } from '../src/domains/admission/errors';

export { loadDescriptorRegistry } from '../src/domains/records/loader.server';

export { createRecordRedactionPort } from '../src/domains/records/redaction.server';

export {registerRecordFormActions} from '../src/domains/records/form-actions.server';
export {createRecordHttp} from '../src/domains/records/routes.server';
