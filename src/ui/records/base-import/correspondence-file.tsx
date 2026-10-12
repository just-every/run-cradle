import { useId } from 'react'

export function ImportCorrespondenceFile({ disabled, onLoad }: {
  disabled: boolean
  onLoad: (file: File | undefined) => void
}) {
  const helpId = useId()
  return <div className="cr-field">
    <label>CSV correspondence (optional correspondence.json)
      <input type="file" accept=".json,application/json" disabled={disabled}
        aria-describedby={helpId} onChange={event => onLoad(event.target.files?.[0])} />
    </label>
    <small id={helpId}>Load the accompanying import-options.json under CSV review choices to use correspondence. Proposed reference identities and every empty-cell state are shown next. Loading never accepts them.</small>
  </div>
}
