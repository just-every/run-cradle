import { ClientChip } from './parts/ClientChip'
import { Feature } from './parts/Feature'
import { Screen } from './parts/Screen'

const columns = [
  ['Planning', [['Spring catalogue', 'Dec 02', 'Northgate'], ['Trade stand', 'Feb 18', 'Marlow']]],
  ['In progress', [['Website refresh', 'Nov 14', 'Alder & Finch'], ['Warehouse move', 'Jan 09', 'Tidewater']]],
  ['Done', [['Staff handbook', 'Oct 21', 'Birchwell']]],
] as const

/** One set of records read as a board, with the filter, group and saved-view chips above it. */
export function Views() {
  return <Feature id="views" eyebrow="Views" title="One set of records, many views." side="left"
    copy={<p>Grid, board and form read the same records. Filter, group and sort them, then save a view so it is one click away.</p>}>
    <Screen title="Projects" tab="Board">
      <div className="lp-filters"><span className="lp-filter">Filter: Client is Alder &amp; Finch</span><span className="lp-filter">Group: Status</span><span className="lp-filter lp-filter--saved">Saved view: This quarter</span></div>
      <div className="lp-board">{columns.map(([name, cards]) => <div key={name} className="lp-col">
        <h4>{name} <i>{cards.length}</i></h4>
        {cards.map(([title, due, client]) => <div key={title} className="lp-card"><strong>{title}</strong><small>Due {due}</small><ClientChip name={client} /></div>)}
      </div>)}</div>
    </Screen>
  </Feature>
}
