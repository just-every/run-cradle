/** Columns a launch CSV import can fill, by the adapter's field names. Shared by the
 * import door and its screen; custom campaign fields map as `custom:<field id>`. */
export const launchImportKinds = ['campaign', 'deliverable', 'milestone'] as const
export type LaunchImportKind = (typeof launchImportKinds)[number]
export type LaunchImportField = { name: string; label: string; key?: true }
export const launchImportFields: Record<LaunchImportKind, LaunchImportField[]> = {
 campaign: [
  { name: 'code', label: 'Campaign code', key: true }, { name: 'name', label: 'Name' }, { name: 'ownerId', label: 'Owner' },
  { name: 'startDate', label: 'Start date' }, { name: 'launchDate', label: 'Launch date' }, { name: 'objective', label: 'Objective' },
  { name: 'statusSummary', label: 'Status summary' }, { name: 'phase', label: 'Phase' }, { name: 'status', label: 'Status' },
  { name: 'health', label: 'Health' }, { name: 'budgetMinor', label: 'Budget (minor units)' }, { name: 'spendMinor', label: 'Spend (minor units)' },
  { name: 'tags', label: 'Tags' },
 ],
 deliverable: [
  { name: 'campaignCode', label: 'Campaign code', key: true }, { name: 'title', label: 'Title', key: true },
  { name: 'ownerId', label: 'Owner' }, { name: 'dueDate', label: 'Due date' },
 ],
 milestone: [
  { name: 'campaignCode', label: 'Campaign code', key: true }, { name: 'title', label: 'Title', key: true },
  { name: 'ownerId', label: 'Owner' }, { name: 'type', label: 'Type' }, { name: 'status', label: 'Status' },
  { name: 'startDate', label: 'Start date' }, { name: 'endDate', label: 'End date' }, { name: 'conflictReason', label: 'Conflict reason' },
 ],
}
export const launchImportLabels: Record<LaunchImportKind, string> = { campaign: 'Campaigns', deliverable: 'Deliverables', milestone: 'Milestones' }
