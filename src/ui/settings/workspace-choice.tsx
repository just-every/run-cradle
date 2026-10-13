import { useEffect, useState } from 'react'

/** The runtime's IANA time zones or ISO currencies, as a select. The list is read in the browser after hydration, so the server and browser render the same first frame: the saved value alone. */
export function WorkspaceChoice({ label, kind, value, onChange, className }: { label: string; kind: 'timeZone' | 'currency'; value: string; onChange: (value: string) => void; className: string }) {
  const [options, setOptions] = useState<string[]>([value])
  useEffect(() => { const known = Intl.supportedValuesOf(kind); setOptions(known.includes(value) ? known : [value, ...known]) }, [kind, value])
  return <label className={`cr-field ${className}`}>{label}<select value={value} onChange={event => onChange(event.target.value)} required>{options.map(option => <option key={option} value={option}>{option}</option>)}</select></label>
}
