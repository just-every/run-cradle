import type { D1UndoReport } from '../../../../vendor/base/modules/import-kit/src/d1/undo-types'
import type { D1ImportContext } from '../../../../vendor/base/modules/import-kit/src/d1/types'
import { readD1ImportUndoReport } from '../../../../vendor/base/modules/import-kit/src/d1/index'
import { reversalState } from '../../../../vendor/base/modules/import-kit/src/d1/undo-state'
import type { ImportReversalReport } from './contracts'

export async function completeImportUndoReport(id:string,context:D1ImportContext):Promise<D1UndoReport> {
 const report=await readD1ImportUndoReport(id,context,{limit:1000})
 // The pinned Kit validates the complete durable state and its guards before
 // returning this job. Reuse that verified state instead of reloading the full
 // custody/inventory for every page. The service still applies privacy rules.
 const state=reversalState(report.job)
 if(state.policy!==report.policy||state.cursor!==report.cursor||state.dispositions.length!==report.total)throw new Error('IMPORT_UNDO_REPORT_CHANGED')
 return {...report,dispositions:[...state.dispositions],nextOffset:null}
}

/** All conflict evidence comes from the Kit's guarded, durable publication.
 * An intent to reverse or an uncommitted observation is never a final report. */
export function importReversalReport(report:D1UndoReport,activeEffects:number):ImportReversalReport|undefined {
 if(report.policy!=='preserve-conflicts'||!['undoing','undone','rolling_back','rolled_back'].includes(report.job.state))return undefined
 const reversed=report.dispositions.filter(item=>item.disposition==='reversed').length,conflicts=report.dispositions.filter(item=>item.disposition==='retained'),total=activeEffects+reversed,processed=report.dispositions.length
 return {policy:report.policy,state:report.job.state,terminal:report.job.state==='undone'||report.job.state==='rolled_back',cursor:report.cursor,fence:report.job.fence,processed,total,reversed,retained:conflicts.length,remaining:Math.max(0,total-processed),conflicts,dispositions:report.dispositions,schemaRetained:true,originalUploadsRetained:true}
}
