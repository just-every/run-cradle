/** Workspace presentation for CSV exports: calendar dates stay as stored, instants use the
 * workspace timezone with its offset, and money is in the workspace currency's major unit. */
export type ExportWorkspace = { timezone: string; currency: string; capturedAt: string }
export const instant = (value: number | string | null, timezone: string) => value === null ? '' : new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset' }).format(new Date(value))
export const money = (minor: number | null) => minor === null ? '' : (minor < 0 ? '-' : '') + String(Math.floor(Math.abs(minor) / 100)) + '.' + String(Math.abs(minor) % 100).padStart(2, '0')
export const exportFilename = (view: string, workspace: ExportWorkspace) => [view, workspace.currency, instant(workspace.capturedAt, workspace.timezone)].join(' — ').replace(/[\/:*?"<>|]/g, '-') + '.csv'
export async function exportWorkspace(db: D1Database, now: Date): Promise<ExportWorkspace> {
 const settings = await db.prepare('SELECT timezone,currency FROM workspace_settings LIMIT 1').first<{ timezone: string; currency: string }>()
 if (!settings) throw new Error('Workspace timezone and currency are required for CSV export')
 return { ...settings, capturedAt: now.toISOString() }
}
