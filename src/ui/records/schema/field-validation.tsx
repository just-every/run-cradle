import type { Field } from '../../../domains/records/contracts'
import { FieldInput } from '../record-fields'

export function FieldValidationEditor({ field, appId, onChange }: { field: Field; appId: string; onChange: (field: Field) => void }) {
  if (field.type === 'computed' || field.type === 'relation' || field.type === 'attachment') return null
  const limits = field.validation ?? {}
  const bounded = ['number', 'money', 'date', 'instant'].includes(field.type)
  const text = ['text', 'url'].includes(field.type)
  function bound(key: keyof NonNullable<Field['validation']>, value: string) {
    const validation = { ...limits }
    if (value === '') delete validation[key]
    else Object.assign(validation, { [key]: key === 'minLength' || key === 'maxLength' ? Number(value) : value })
    onChange({ ...field, validation })
  }
  return <details className="cr-detail"><summary>Validation and default</summary><div className="cr-field-extra">
    {bounded && <>{(['min', 'max'] as const).map(key => <label className="cr-field" key={key}>{key === 'min' ? 'Minimum' : 'Maximum'}{field.type === 'money' ? ' (minor units)' : ''}<input inputMode={['number', 'money'].includes(field.type) ? 'decimal' : undefined} value={limits[key] ?? ''} onChange={event => bound(key, event.target.value)} /></label>)}</>}
    {text && <><label className="cr-field">Minimum length<input type="number" min="0" value={limits.minLength ?? ''} onChange={event => bound('minLength', event.target.value)} /></label><label className="cr-field">Maximum length<input type="number" min="0" value={limits.maxLength ?? ''} onChange={event => bound('maxLength', event.target.value)} /></label><label className="cr-field">Pattern<input aria-label="Pattern" aria-describedby={`pattern-help-${field.id}`} placeholder="^[A-Z0-9-]+$" value={limits.pattern ?? ''} onChange={event => bound('pattern', event.target.value)} /><small id={`pattern-help-${field.id}`}>Match the complete value. Use letters, character classes and bounded repeats.</small></label></>}
    {field.type !== 'person' && <><label className="cr-choice"><input type="checkbox" checked={field.defaultValue !== undefined} onChange={event => { const next = { ...field }; if (event.target.checked) next.defaultValue = field.type === 'boolean' ? false : field.type === 'multi_select' ? [] : null; else delete next.defaultValue; onChange(next) }} />Use a default for new records</label>{field.defaultValue !== undefined && <FieldInput appId={appId} field={{ ...field, id: `${field.id}-default`, label: 'Default value', required: false, unique: false }} value={field.defaultValue} onChange={defaultValue => onChange({ ...field, defaultValue })} />}</>}
  </div></details>
}
