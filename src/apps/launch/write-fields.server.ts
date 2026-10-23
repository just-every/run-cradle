import { launchColumns, launchFieldIds, type LaunchKind } from './descriptors.server'

// Generated attribution belongs to the field whose command produced it.
export const launchAttributionFields: Partial<Record<LaunchKind, Record<string, string>>> = {
 campaign: { health_updated_at: 'health', health_set_by_id: 'health' },
 deliverable: { completed_at: 'state', completed_by_id: 'state' },
 risk: { resolved_at: 'state', resolved_by_id: 'state', escalated_at: 'state', escalated_by_id: 'state' },
 decision: { outcome_at: 'state', outcome_by_id: 'state' },
 readiness: { acknowledged_at: 'state', notification_id: 'state' },
}

export const launchFieldForColumn = (kind: LaunchKind, column: string): string | undefined => {
 const name = Object.entries(launchColumns[kind]).find(([, value]) => value === column)?.[0] ?? launchAttributionFields[kind]?.[column]
 return name ? launchFieldIds[kind][name] : undefined
}
