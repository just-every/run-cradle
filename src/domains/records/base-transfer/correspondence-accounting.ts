import type { CorrespondenceReview } from './correspondence-format'
import type { ImportReport,PlannedRecord } from './contracts'
/** Accepted null states must not be reported as ordinary blank-checkbox conversion. */
export function accountCorrespondenceNulls(report:ImportReport,records:PlannedRecord[],review?:CorrespondenceReview):void {
 if(!review?.accepted)return
 const accepted=new Set(records.map(row=>JSON.stringify([row.tableKey,row.rowKey]))),counts=new Map<string,{all:number;retained:number}>()
 for(const cell of review.cells)if(cell.state==='null'){const key=JSON.stringify([cell.tableKey,cell.columnKey]);const count=counts.get(key)??{all:0,retained:0};count.all++;if(accepted.has(JSON.stringify([cell.tableKey,cell.rowKey])))count.retained++;counts.set(key,count)}
 for(const table of report.tables)for(const column of table.columns){const count=counts.get(JSON.stringify([table.tableKey,column.columnKey]));if(!count)continue;if(count.retained){column.restoredNull=count.retained;column.reasons.push(`${count.retained} empty cells retained as native null through accepted correspondence.`)}if(column.chosenType==='boolean')column.normalizedBlankCheckboxFalse=Math.max(0,(column.normalizedBlankCheckboxFalse??0)-count.all)}
}
