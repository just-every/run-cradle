import { useId, useRef, type ReactNode } from 'react'
import type { EntitySchema, RecordRow, TimelineBaseline, View } from '../../domains/records/contracts'
import { addDays } from './calendar-dates'
import { CellDisplay } from './record-fields'
import { ViewMatchCell } from './view-match'
import type { ViewMatch } from './find-in-view'
import type { TimelineSchedule } from './timeline-model'
import type { timelineAxis } from './timeline-axis'
import { timelineLines } from './timeline-groups'

type Axis = ReturnType<typeof timelineAxis>
export function TimelineChart({ schema, view, schedule, baseline, axis, writable, busy, move, onDraft, match }: {
  schema: EntitySchema; view: View; schedule: TimelineSchedule; baseline?: TimelineBaseline; axis: Axis; writable: (row: RecordRow) => boolean; busy: boolean;
  move: (row: RecordRow, date: string) => void; onDraft: (row: RecordRow) => void; match?: ViewMatch | null;
}) {
  const dragging = useRef<{ row: RecordRow; offset: number } | null>(null), marker = useId().replaceAll(':', '')
  const details = view.fields.filter(id => id !== view.layout.titleFieldId), rowHeight = 96 + details.length * 20
  const lines = timelineLines(schedule.tasks, view.groupBy), positions = new Map<string, number>()
  const byId = new Map(schedule.tasks.map(task => [task.row.id, task]))
  let height = 0
  for (const line of lines) { if (line.kind === 'task') positions.set(line.task.row.id, height + 34); height += line.kind === 'group' ? 44 : rowHeight }
  const planned = new Map(baseline?.records.map(record => [record.recordId, record]))
  const title = (row: RecordRow) => <ViewMatchCell recordId={row.id} fieldId={view.layout.titleFieldId} match={match}><CellDisplay appId={schema.appId} field={schema.fields.find(field => field.id === view.layout.titleFieldId)} cell={row.fields[view.layout.titleFieldId]} /></ViewMatchCell>
  function drop(row: RecordRow, coordinate: number) { const start=byId.get(row.id)?.start; if(start===null||start===undefined)return; const days=Math.round((axis.at(coordinate)-start)/86400000); move(row,addDays(axis.civil(start),days)) }
  return <div className="cr-timeline-scroll" role="region" aria-label={`${view.name} timeline; scroll for dates`} tabIndex={0}>
    <div className="cr-timeline-chart" style={{ width: `calc(var(--timeline-label) + ${axis.width}px)` }}>
      <div className="cr-timeline-head"><div className="cr-timeline-label">Record / planned dates</div><div className="cr-timeline-axis" style={{ width: axis.width }}>{axis.ticks.map(tick => <div key={tick.date} data-timeline-date={tick.date} style={{ left: tick.left, width: tick.width }}><time dateTime={tick.date}>{tick.label}</time></div>)}</div></div>
      <div className="cr-timeline-body" style={{ height }}>
        <svg className="cr-timeline-links" width={axis.width} height={height} role="img" aria-label="Time axis and dependency links">
          {axis.ticks.map(tick => <line key={tick.date} x1={tick.left} x2={tick.left} y1={0} y2={height} className="cr-timeline-gridline" />)}
          <defs>{['normal','critical','conflict'].map(tone => <marker key={tone} id={`${marker}-${tone}`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7 Z" className={`cr-timeline-arrow--${tone}`} /></marker>)}</defs>
          {schedule.edges.map(edge => {
            const from = byId.get(edge.from)!, to = byId.get(edge.to)!
            if (from.end === null || to.start === null) return null
            const x1 = axis.x(from.end) + 3, x2 = axis.x(to.start) - 3, y1 = positions.get(edge.from)!, y2 = positions.get(edge.to)!, elbow = x1 + 10
            const tone = edge.conflict ? 'conflict' : edge.critical ? 'critical' : 'normal'
            return <path key={`${edge.from}:${edge.to}`} data-timeline-dependency={`${edge.from}:${edge.to}`} data-conflict={edge.conflict} data-critical={edge.critical} className={`cr-timeline-link cr-timeline-link--${tone}`} d={`M${x1},${y1} H${elbow} V${y2 - 12} H${x2 - 8} V${y2} H${x2}`} markerEnd={`url(#${marker}-${tone})`}><title>{`${edge.conflict ? 'Conflict: successor starts before predecessor ends' : edge.critical ? 'Critical dependency' : 'Dependency'} · ${edge.from} → ${edge.to}`}</title></path>
          })}
        </svg>
        {lines.map(line => {
          if (line.kind === 'group') return <div key={line.key} className="cr-timeline-group"><div className="cr-timeline-label">{view.groupBy.map(id => <span key={id}><CellDisplay appId={schema.appId} field={schema.fields.find(field => field.id === id)} cell={line.row.fields[id]} /> </span>)}</div></div>
          const task = line.task, row = task.row, before = planned.get(row.id), critical = schedule.critical.has(row.id)
          const baselineStart = before?.start ? Date.parse(before.start) : null, baselineEnd = before?.end ? Date.parse(before.end) : baselineStart
          const range = task.start === null ? 'Unscheduled' : `${axis.civil(task.start)}${task.end !== null && view.layout.endFieldId ? ` → ${axis.civil(task.end)}` : ''}`
          let comparison: ReactNode = null
          if (baselineStart !== null && task.start !== null) {
            const delta = task.start - baselineStart, finish = task.end !== null && baselineEnd !== null ? task.end - baselineEnd : 0
            const difference = (value: number) => `${Number((Math.abs(value) / 86400000).toPrecision(3))}d ${value > 0 ? 'later' : 'earlier'}`
            comparison = <span className="cr-timeline-comparison" data-timeline-variance={row.id}>{delta ? `Start ${difference(delta)}` : 'Start matches baseline'}{finish ? ` · Finish ${difference(finish)}` : ''}</span>
          }
          return <div className="cr-timeline-row" style={{ height: rowHeight }} key={row.id} data-timeline-row={row.id} data-critical={critical} data-conflict={task.issues.includes('Starts before a predecessor ends')}>
            <div className="cr-timeline-label"><a href={`/app/records/${schema.appId}/${schema.id}/${row.id}`}>{title(row)}</a><small>{range}</small>{critical && <small className="cr-timeline-critical-label">Critical path</small>}{task.issues.length > 0 && <small className="cr-timeline-issue" title={task.issues.join('. ')}>{task.issues.join(' · ')}</small>}{details.map(id => <small key={id}>{schema.fields.find(field => field.id === id)?.label}: <ViewMatchCell recordId={row.id} fieldId={id} match={match}><CellDisplay appId={schema.appId} field={schema.fields.find(field => field.id === id)} cell={row.fields[id]} /></ViewMatchCell></small>)}{writable(row) && <button type="button" className="cr-button cr-button--quiet" aria-label={`Move record ${row.id}`} disabled={busy} onClick={() => onDraft(row)}>Move date</button>}</div>
            <div className="cr-timeline-track" style={{ width: axis.width }} onDragOver={event => { if (dragging.current && writable(dragging.current.row) && !busy) { event.preventDefault(); event.dataTransfer.dropEffect = 'move' } }} onDrop={event => {
              const source = dragging.current; dragging.current = null
              if (!source || event.dataTransfer.getData('application/x-cradle-timeline-record') !== source.row.id || !writable(source.row) || busy) return
              event.preventDefault(); drop(source.row, event.clientX - event.currentTarget.getBoundingClientRect().left - source.offset)
            }}>
              {task.start !== null && task.end !== null && task.end >= task.start && <div className={`cr-timeline-bar${critical ? ' cr-timeline-bar--critical' : ''}`} data-timeline-bar={row.id} data-start={new Date(task.start).toISOString()} data-end={new Date(task.end).toISOString()} style={{ left: axis.x(task.start), width: Math.max(12, axis.x(task.end) - axis.x(task.start)) }} draggable={writable(row) && !busy} aria-label={`${range}${critical ? '; critical path' : ''}`} title={`${range}${critical ? ' · Critical path' : ''}`}
                onDragStart={event => { if (!writable(row) || busy) { event.preventDefault(); return }; dragging.current = { row, offset: event.clientX - event.currentTarget.getBoundingClientRect().left }; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-cradle-timeline-record', row.id) }} onDragEnd={() => { dragging.current = null }}><span><CellDisplay appId={schema.appId} field={schema.fields.find(field => field.id === view.layout.titleFieldId)} cell={row.fields[view.layout.titleFieldId]} /></span></div>}
              {baselineStart !== null && baselineEnd !== null && baselineEnd >= baselineStart && <div className="cr-timeline-baseline-bar" data-timeline-baseline={row.id} style={{ left: axis.x(baselineStart), width: Math.max(12, axis.x(baselineEnd) - axis.x(baselineStart)) }} title={`Baseline: ${before!.start}${before!.end ? ` → ${before!.end}` : ''}`} />}
              {comparison}
            </div>
          </div>
        })}
      </div>
    </div>
  </div>
}
