import type { ReactNode } from 'react'
import { Bar, BoltGlyph, CalendarGlyph, CheckGlyph, CsvGlyph, LinkGlyph, NoteGlyph, PersonGlyph, SheetGlyph, SparkGlyph, TableTile } from './glyphs'

export type CardKind = 'sheet' | 'list' | 'contact' | 'link' | 'csv' | 'notes' | 'calendar' | 'checks' | 'bolt' | 'doc' | 'brief'

const dot = (cx: number, cy: number, color: string, r = 4.2) => <circle cx={cx} cy={cy} r={r} fill={color} />

/** What each floating card draws, in the card's own pixel space (its width and height from the layout). Shapes only. */
export const bodies: Record<Exclude<CardKind, 'link'>, () => ReactNode> = {
  sheet: () => <><SheetGlyph x={16} y={22} /><TableTile x={72} y={30} /></>,
  list: () => <>
    {dot(22, 27, '#2e5d4b')}<Bar x={36} y={23.5} w={64} color="#b8c6bb" />
    {dot(22, 50, '#12372e')}<Bar x={36} y={46.5} w={56} color="#c6d1c7" />
    {dot(22, 73, '#c8d3c8')}<Bar x={36} y={69.5} w={64} color="#b8c6bb" />
  </>,
  contact: () => <><PersonGlyph x={14} y={20} /><Bar x={72} y={24} w={72} color="#c6d1c7" /><Bar x={72} y={40} w={62} color="#d3dbd2" /><Bar x={72} y={56} w={44} color="#d3dbd2" /></>,
  csv: () => <><CsvGlyph x={14} y={15} /><Bar x={76} y={30} w={42} color="#d6dcd4" /><Bar x={76} y={46} w={32} color="#d6dcd4" /><Bar x={76} y={62} w={22} color="#d6dcd4" /></>,
  notes: () => <>
    <Bar x={18} y={26} w={74} color="#b8c6bb" /><Bar x={18} y={44} w={104} color="#c3cfc4" /><Bar x={18} y={62} w={88} color="#b8c6bb" /><Bar x={18} y={80} w={46} color="#c6d1c7" />
    <rect x="106" y="-4" width="26" height="11" rx="2.5" fill="#d7f25b" transform="rotate(-6 119 1)" />
  </>,
  calendar: () => <CalendarGlyph x={28} y={20} />,
  checks: () => <>
    <CheckGlyph x={16} y={21} color="#2f6b4c" /><Bar x={42} y={24} w={72} color="#bdcbc0" /><Bar x={118} y={24} w={20} color="#dde4db" />
    <CheckGlyph x={16} y={46} color="#2f6b4c" /><Bar x={42} y={49} w={50} color="#5c8577" /><Bar x={96} y={49} w={42} color="#dde4db" />
    <CheckGlyph x={16} y={71} color="#7c6a55" /><rect x="42" y="73.5" width="36" height="9" rx="4.5" fill="#a78de6" /><Bar x={82} y={74} w={48} color="#dde4db" />
  </>,
  bolt: () => <><BoltGlyph x={20} y={13} /><Bar x={62} y={21} w={96} color="#b8c6bb" /><Bar x={62} y={42} w={50} color="#c6d1c7" /></>,
  doc: () => <><NoteGlyph x={16} y={20} /><Bar x={60} y={26} w={52} color="#b8c6bb" /><Bar x={60} y={44} w={36} color="#c6d1c7" /></>,
  brief: () => <><SparkGlyph x={16} y={18} /><Bar x={62} y={24} w={72} color="#b8c6bb" /><Bar x={62} y={44} w={58} color="#c3cfc4" /><Bar x={62} y={64} w={72} color="#b8c6bb" /></>,
}

/** The link chip is a round token; everything else is a white card. */
export const chipBody = (size: number) => <><circle cx={size / 2} cy={size / 2} r={size / 2} fill="#fdfdfb" stroke="rgba(18,55,46,.07)" /><LinkGlyph x={size / 2 - 11} y={size / 2 - 11} /></>
