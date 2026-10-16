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
    <small id={helpId}>If your download includes import-options.json, load it under CSV review choices too. The preview shows how records will be linked and how empty cells will be handled. Review these choices before accepting them.</small>
  </div>
}
