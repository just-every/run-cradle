import { ClientChip } from './parts/ClientChip'
import { Feature } from './parts/Feature'
import { Screen } from './parts/Screen'

const columns = [
  ['Name', 'Text', ''],
  ['Status', 'Select', 'lp-hide-sm'],
  ['Due', 'Date', 'lp-hide-sm'],
  ['Client', 'Linked record', ''],
  ['City', 'Lookup', ''],
] as const

const rows = [
  ['Website refresh', 'In progress', 'prog', 'Nov 14', 'Alder & Finch', 'Leeds'],
  ['Spring catalogue', 'Planning', 'plan', 'Dec 02', 'Northgate', 'Bristol'],
  ['Staff handbook', 'Done', 'done', 'Oct 21', 'Birchwell', 'Austin'],
  ['Warehouse move', 'In progress', 'prog', 'Jan 09', 'Tidewater', 'Perth'],
] as const

const templates = ['Customer relationships', 'Project tracker', 'Launch readiness']

/** Typed fields and linked records: a close-up of the Projects grid with its field types named under each header. */
export function Tables() {
  return <Feature id="tables" eyebrow="Tables" title="Build your own tables." side="right"
    copy={<p>Give every field a type, then link records across tables and look values up through the link. Start from a template or a blank table.</p>}>
    <Screen title="Projects" tab="Grid">
      <table className="lp-tbl">
        <thead><tr>{columns.map(([name, type, hide]) => <th key={name} className={hide}><span>{name}</span><small>{type}</small></th>)}</tr></thead>
        <tbody>{rows.map(([name, status, tone, due, client, city]) => <tr key={name}>
          <td className="lp-cell-name">{name}</td>
          <td className="lp-hide-sm"><span className={`lp-chip lp-chip--${tone}`}>{status}</span></td>
          <td className="lp-hide-sm">{due}</td>
          <td><ClientChip name={client} /></td>
          <td className="lp-cell-derived">{city}</td>
        </tr>)}</tbody>
      </table>
      <div className="lp-starts"><b>Start from</b>{templates.map(name => <span key={name} className="lp-pill">{name}</span>)}<span className="lp-pill lp-pill--blank">Blank</span></div>
    </Screen>
  </Feature>
}
