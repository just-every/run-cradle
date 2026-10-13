import { UiIcon, type UiIconName } from '../../shared/ui-icon'
import { templates } from './templates'

const look: Record<string, { icon: UiIconName; tone: string }> = { crm: { icon: 'people', tone: 'sage' }, launch: { icon: 'rocket', tone: 'lilac' }, projects: { icon: 'folder', tone: 'sage' } }

/** "Start from a template": the included templates as cards, shown in the empty state and when creating a base. */
export function TemplateCards({ onUse }: { onUse: (templateId: string) => void }) {
  return <section className="cr-templates" aria-labelledby="cr-templates-title"><h3 id="cr-templates-title">Start from a template</h3><div className="cr-template-grid">{templates.map(t => <article key={t.id} className="cr-card cr-template"><span className={`cr-template-icon cr-template-icon--${look[t.id]?.tone ?? 'sage'}`}><UiIcon name={look[t.id]?.icon ?? 'folder'} size={18} /></span><h4>{t.name}</h4><p>{t.description}</p><button type="button" className="cr-button cr-button--quiet" onClick={() => onUse(t.id)}>Use {t.name}</button></article>)}</div></section>
}
