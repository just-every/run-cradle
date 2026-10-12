import { PlanTooLargeError } from '../../../../vendor/base/modules/import-kit/src/plan/size'
import { D1RequestLimitError } from '../../../../vendor/base/modules/import-kit/src/d1/budget'
import { AdmissionError } from '../../admission/errors'
export function importCapacityError(error:unknown):never {
 if(error instanceof Error&&['IMPORT_D1_STATEMENT_LIMIT','IMPORT_D1_VALUE_LIMIT'].includes(error.message))throw new AdmissionError('capacity_limit','The import exceeds a D1 statement or value capacity. Import a smaller self-contained table set. Nothing was written.')
 if(error instanceof D1RequestLimitError)throw new AdmissionError('capacity_limit','Import custody exceeds the D1 request statement capacity (1000). Nothing was written.')
 if(error instanceof PlanTooLargeError)throw new AdmissionError('capacity_limit',`Import plan size limit ${error.limit} bytes (${error.limit/1_000_000} MB); current measured ${error.subject} size ${error.bytes} bytes. Original files, parsed rows and planned records/links all count. Import fewer or smaller tables. Nothing was written.`)
 throw error
}
