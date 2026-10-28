import {RecordTemplateButtonsPanel} from '../../../../ui/settings/record-template-buttons-panel'
import {GuestsPanel} from '../../../../ui/settings/guests-panel'
import {EmailDeliveryStatus} from '../../../../ui/settings/email-delivery-status'
import {SlackAppPanel} from '../../../../ui/settings/slack-app-panel'
import {SmsPanel} from '../../../../ui/settings/sms-panel'
import {AdminAuditPanel} from '../../../../ui/settings/admin-audit-panel'
import {TrashPanel} from '../../../../ui/settings/trash-panel'
import {ReadinessSettings} from '../../../../ui/settings/readiness-settings'
import {LaunchAiSettings} from '../../../../ui/settings/launch-ai-settings'
import { LazySettingsPanel } from '../../../../ui/settings/lazy-settings-panel'
import { CustomFieldsPanel } from '../../../../ui/settings/custom-fields-panel'
import { ImportsPanel } from '../../../../ui/settings/imports-panel'
import { SampleDataPanel } from '../../../../ui/settings/sample-data-panel'
import { PreferencesPanel } from '../../../../ui/settings/preferences-panel'
import { UsagePanel } from '../../../../ui/settings/usage-panel'
import { ConnectionPanel } from '../../../../ui/settings/connection-panel'
import { ArchivePanel } from '../../../../ui/settings/archive-panel'
import { WarehousePanel } from '../../../../ui/settings/warehouse-panel'
import { AccessPanel } from '../../../../ui/settings/access-panel'
import { ApiKeysPanel } from '../../../../ui/settings/api-keys-panel'
import { WorkspaceChoice } from '../../../../ui/settings/workspace-choice'
import { sessionFetch } from '../../../../ui/shared/session-fetch'
import { useRef } from 'react'
import { useInitialDocumentValue } from '../../../app/document-data'
import { useEffect, useReducer, useState, type FormEvent } from 'react'
import './settings-page.css'

type SettingValue = string | number | boolean | null | string[] | Record<string, unknown>
type Settings = { version: number; workspace: { name: string; timezone: string; currency: string; quietHoursStart: string; quietHoursEnd: string }; profile: Record<string, SettingValue>; appearance: Record<string, SettingValue>; notifications: Record<string, SettingValue>; security: Record<string, SettingValue>; ai: { enabled: boolean; configured: boolean; missing: string[]; usage?: Record<string, SettingValue> }; email: { configured: boolean; missing: string[]; deliveries?: Record<string, SettingValue> }; dataStorage: Record<string, SettingValue> }
type State = { kind: 'loading' } | { kind: 'ready'; value: Settings } | { kind: 'failed'; message: string } | { kind: 'signed-out' } | { kind: 'not-found' }
const request = async (path: string, init?: RequestInit) => { const result = await sessionFetch(path, { credentials: 'same-origin', headers: { 'content-type': 'application/json', ...init?.headers }, ...init }); const payload: unknown = await result.json().catch(() => null); if (result.status === 401) throw new Error('signed-out'); if (result.status === 404) throw new Error('not-found'); if (!result.ok) throw new Error(payload && typeof payload === 'object' && 'error' in payload && typeof (payload as { error?: { message?: unknown } }).error?.message === 'string' ? (payload as { error: { message: string } }).error.message : 'Settings request failed.'); return payload }
const value = (input: unknown, label: string) => { if (typeof input !== 'string') throw new Error(`Settings omitted ${label}.`); return input }
const settings = (payload: unknown): Settings => { if (!payload || typeof payload !== 'object' || !('settings' in payload)) throw new Error('Settings returned an invalid response.'); const source = (payload as { settings: unknown }).settings; if (!source || typeof source !== 'object') throw new Error('Settings returned an invalid response.'); const item = source as Record<string, unknown>; const workspace = item.workspace; const ai = item.ai; const email = item.email; if (!workspace || typeof workspace !== 'object' || !ai || typeof ai !== 'object' || !email || typeof email !== 'object' || typeof item.version !== 'number') throw new Error('Settings returned an invalid response.'); const workspaceRecord = workspace as Record<string, unknown>; const aiRecord = ai as Record<string, unknown>; const emailRecord = email as Record<string, unknown>; if (typeof aiRecord.enabled !== 'boolean' || typeof aiRecord.configured !== 'boolean' || !Array.isArray(aiRecord.missing) || typeof emailRecord.configured !== 'boolean' || !Array.isArray(emailRecord.missing)) throw new Error('Settings returned an invalid capability state.'); const section = (key: string) => { const sectionValue = item[key]; return sectionValue && typeof sectionValue === 'object' && !Array.isArray(sectionValue) ? sectionValue as Record<string, SettingValue> : {} }; return { version: item.version, workspace: { name: value(workspaceRecord.name, 'workspace name'), timezone: value(workspaceRecord.timezone, 'workspace timezone'), currency: value(workspaceRecord.currency, 'workspace currency'), quietHoursStart: value(workspaceRecord.quietHoursStart, 'quiet hours start'), quietHoursEnd: value(workspaceRecord.quietHoursEnd, 'quiet hours end') }, profile: section('profile'), appearance: section('appearance'), notifications: section('notifications'), security: section('security'), ai: { enabled: aiRecord.enabled, configured: aiRecord.configured, missing: aiRecord.missing.map((item) => value(item, 'AI prerequisite')), usage: section('ai').usage as Record<string, SettingValue> | undefined }, email: { configured: emailRecord.configured, missing: emailRecord.missing.map((item) => value(item, 'email prerequisite')), deliveries: section('email').deliveries as Record<string, SettingValue> | undefined }, dataStorage: section('dataStorage') } }
const format = (input: SettingValue) => input === null ? 'Not set' : Array.isArray(input) ? input.join(', ') : typeof input === 'object' ? Object.entries(input).map(([key, value]) => `${key}: ${String(value)}`).join(' · ') : String(input)
const Details = ({ title, values, level = 2 }: { title: string; values: Record<string, SettingValue>; level?: 2 | 3 }) => { const entries = Object.entries(values).filter(([, item]) => format(item) !== ''); if (entries.length === 0) return null; const Heading = level === 2 ? 'h2' : 'h3'; return <section className={level === 2 ? 'cr-card cr-settings-details' : 'cr-settings-details'}><Heading>{title}</Heading><dl>{entries.map(([key, item]) => <div className="cr-tile" key={key}><dt>{key}</dt><dd>{format(item)}</dd></div>)}</dl></section> }

export const SettingsPage = () => {
  const [connectionsOpen, setConnectionsOpen] = useState(false)
  const [keysOpen,setKeysOpen]=useState(false)
  const [revision, retry] = useReducer((current) => current + 1, 0)
  const initial = useInitialDocumentValue('/api/settings', settings)
  const [state, setState] = useState<State>(() => initial === undefined ? { kind: 'loading' } : { kind: 'ready', value: initial })
  const [form, setForm] = useState<Settings['workspace'] | null>(initial?.workspace ?? null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSaving, setSaving] = useState(false)
  const mounted = useRef(false)
  useEffect(() => { if (!mounted.current) { mounted.current = true; if (initial !== undefined) return } let active = true; setState({ kind: 'loading' }); void request('/api/settings').then(settings).then((current) => { if (!active) return; setState({ kind: 'ready', value: current }); setForm(current.workspace) }, (caught: unknown) => { if (!active) return; setState(caught instanceof Error && caught.message === 'signed-out' ? { kind: 'signed-out' } : caught instanceof Error && caught.message === 'not-found' ? { kind: 'not-found' } : { kind: 'failed', message: caught instanceof Error ? caught.message : 'Settings request failed.' }) }); return () => { active = false } }, [revision])
  const submit = async (event: FormEvent) => { event.preventDefault(); if (state.kind !== 'ready' || !form) return; setSaveError(null); setSaving(true); try { const payload = await request('/api/settings', { method: 'PATCH', body: JSON.stringify({ version: state.value.version, workspaceName: form.name, timezone: form.timezone, currency: form.currency, quietHoursStart: form.quietHoursStart, quietHoursEnd: form.quietHoursEnd }) }); const current = settings(payload); setState({ kind: 'ready', value: current }); setForm(current.workspace); window.location.reload() } catch (caught) { setSaveError(caught instanceof Error ? caught.message : 'Could not update workspace settings.') } finally { setSaving(false) } }
  if (state.kind === 'loading') return <div className="cr-page"><section className="cr-state" aria-live="polite"><p>Loading workspace settings…</p></section></div>
  if (state.kind === 'signed-out') return <div className="cr-page"><section className="cr-state"><a className="cr-button" href="/signin">Sign in to open Settings.</a></section></div>
  if (state.kind === 'not-found') return <div className="cr-page"><section className="cr-state"><h2>Settings are not configured</h2><p>Finish deployment setup before changing workspace settings.</p></section></div>
  if (state.kind === 'failed' || !form) return <div className="cr-page"><section className="cr-state"><h2>Could not load Settings</h2><p>{state.kind === 'failed' ? state.message : 'Settings form was unavailable.'}</p><button className="cr-button" onClick={retry}>Retry</button></section></div>
  const current = state.value
  const field = (key: keyof Settings['workspace'], label: string, type = 'text', wide = false) => <label className={`cr-field${wide ? ' cr-settings-wide' : ''}`}>{label}<input type={type} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} required /></label>
  return <div className="cr-page cr-settings">
    <div className="cr-settings-main">
      <form className="cr-card cr-settings-workspace" onSubmit={submit}><h2>Workspace</h2><div className="cr-form-grid">{field('name', 'Workspace name', 'text', true)}<WorkspaceChoice className="cr-settings-zone" label="Timezone" kind="timeZone" value={form.timezone} onChange={timezone => setForm({ ...form, timezone })} /><WorkspaceChoice className="cr-settings-currency" label="Currency" kind="currency" value={form.currency} onChange={currency => setForm({ ...form, currency })} />{field('quietHoursStart', 'Quiet hours start', 'time')}{field('quietHoursEnd', 'Quiet hours end', 'time')}</div>{saveError ? <p className="cr-error">{saveError}</p> : null}<button className="cr-button" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save workspace'}</button></form>
      <div className="cr-settings-capabilities">
        <section className="cr-card cr-capability" id="ai">{!current.ai.configured && <span className="cr-tag cr-tag--warn">Not configured</span>}<h2>AI</h2><p className="cr-muted">{current.ai.configured ? current.ai.enabled ? 'AI is configured and enabled. Outputs remain read-only.' : 'AI is configured but disabled.' : 'AI is not configured. Set the installation provider and model.'}</p><LaunchAiSettings configured={current.ai.configured} /></section>
        <section className="cr-card cr-capability">{!current.email.configured && <span className="cr-tag cr-tag--warn">Not configured</span>}<h2>Email</h2><p className="cr-muted">{current.email.configured ? 'Email delivery is configured; failed deliveries remain visible here.' : 'Email is not configured. The workspace owner needs to connect an email provider.'}</p>{current.email.deliveries ? <EmailDeliveryStatus value={current.email.deliveries} /> : null}</section>
      </div>
      <ReadinessSettings/><Details title="Profile" values={current.profile} /><Details title="Appearance" values={current.appearance} /><Details title="Security" values={current.security} /><Details title="Data & storage" values={current.dataStorage} />
    </div>
    <div className="cr-settings-side">
      <ArchivePanel />
      <div className="cr-card"><LazySettingsPanel title="Scheduled warehouse exports"><WarehousePanel /></LazySettingsPanel></div>
      <div className="cr-card cr-settings-rows">
        <details className="cr-detail"><summary>Your notifications</summary><PreferencesPanel /></details>
        <details className="cr-detail" onToggle={event=>setKeysOpen(event.currentTarget.open)}><summary>API keys</summary>{keysOpen&&<ApiKeysPanel />}</details>
        <details className="cr-detail"><summary>Usage and model availability</summary><UsagePanel /></details>
        <LazySettingsPanel title="Twilio SMS"><SmsPanel /></LazySettingsPanel>
        <LazySettingsPanel title="Chat app"><SlackAppPanel /></LazySettingsPanel>
        <LazySettingsPanel title="Record template buttons"><RecordTemplateButtonsPanel /></LazySettingsPanel>
        <LazySettingsPanel title="Custom fields"><CustomFieldsPanel /></LazySettingsPanel>
        <LazySettingsPanel title="Trash"><TrashPanel /></LazySettingsPanel>
        <LazySettingsPanel title="Imports"><ImportsPanel /></LazySettingsPanel>
        <LazySettingsPanel title="Sample data"><SampleDataPanel /></LazySettingsPanel>
        <LazySettingsPanel title="Admin audit log"><AdminAuditPanel /></LazySettingsPanel>
        <LazySettingsPanel title="Guests"><GuestsPanel /></LazySettingsPanel>
        <LazySettingsPanel title="People and authority"><AccessPanel /></LazySettingsPanel>
        <details className="cr-detail" onToggle={event => setConnectionsOpen(event.currentTarget.open)}><summary>Connections</summary>{connectionsOpen && <ConnectionPanel />}</details>
      </div>
    </div>
  </div>
}
