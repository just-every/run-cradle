import type { ReactNode } from 'react'

const INK = '#12372e'

/** A rounded text-line placeholder. Cards show shapes, never words. */
export const Bar = ({ x, y, w, h = 7, color = '#c3cfc4' }: { x: number; y: number; w: number; h?: number; color?: string }) => <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={color} />

/** A document with a folded corner. */
const Page = ({ x, y, w, h, fill, children }: { x: number; y: number; w: number; h: number; fill: string; children?: ReactNode }) => {
  const fold = Math.round(w * 0.3)
  return <g transform={`translate(${x} ${y})`}>
    <path d={`M5 0H${w - fold}L${w} ${fold}V${h - 5}a5 5 0 0 1-5 5H5a5 5 0 0 1-5-5V5a5 5 0 0 1 5-5Z`} fill={fill} />
    <path d={`M${w - fold} 0V${fold - 4}a4 4 0 0 0 4 4H${w}`} fill="#ffffff" fillOpacity=".28" />
    {children}
  </g>
}

/** A generic spreadsheet: a green page with a table cut into it. */
export const SheetGlyph = ({ x, y }: { x: number; y: number }) => <Page x={x} y={y} w={46} h={58} fill="#1d6a4b">
  <g stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" opacity=".92"><path d="M10 28h26M10 37h26M10 46h26M20 22v30" fill="none" /></g>
</Page>

/** A small table tile. */
export const TableTile = ({ x, y }: { x: number; y: number }) => <g transform={`translate(${x} ${y})`}>
  <rect width="56" height="50" rx="6" fill="#f1f3ed" stroke="#dce3d7" />
  <path d="M0 13h56M0 26h56M0 38h56M19 0v50M38 0v50" stroke="#d5ddd0" strokeWidth="1.6" fill="none" />
  <rect x="2" y="2" width="15" height="9" rx="3" fill="#e1e8dc" />
</g>

export const PersonGlyph = ({ x, y }: { x: number; y: number }) => <g transform={`translate(${x} ${y})`}>
  <rect width="44" height="44" rx="9" fill="#dfe7db" />
  <circle cx="22" cy="16" r="7.5" fill={INK} />
  <path d="M8 40c1-9 7-14 14-14s13 5 14 14Z" fill={INK} />
</g>

export const CsvGlyph = ({ x, y }: { x: number; y: number }) => <Page x={x} y={y} w={50} h={62} fill={INK}>
  <text x="25" y="46" textAnchor="middle" fill="#fff" fontFamily="Cradle Sans, ui-sans-serif, system-ui, sans-serif" fontSize="15" fontWeight="700" letterSpacing=".4">CSV</text>
</Page>

export const NoteGlyph = ({ x, y }: { x: number; y: number }) => <Page x={x} y={y} w={28} h={34} fill={INK}>
  <path d="M8 16h12M8 22h12M8 28h8" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".9" fill="none" />
</Page>

export const LinkGlyph = ({ x, y, size = 22 }: { x: number; y: number; size?: number }) => <g transform={`translate(${x} ${y}) scale(${size / 16})`} fill="none" stroke={INK} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
  <path d="M7 9.2a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-.8.8M9 6.8a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l.8-.8" />
</g>

export const CalendarGlyph = ({ x, y }: { x: number; y: number }) => <g transform={`translate(${x} ${y})`} fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
  <rect x="2" y="7" width="42" height="38" rx="8" />
  <path d="M2 19h42M14 2v9M32 2v9" />
  <g fill={INK} stroke="none"><circle cx="13" cy="28" r="2.2" /><circle cx="23" cy="28" r="2.2" /><circle cx="33" cy="28" r="2.2" /><circle cx="13" cy="37" r="2.2" /><circle cx="23" cy="37" r="2.2" /></g>
</g>

export const CheckGlyph = ({ x, y, color }: { x: number; y: number; color: string }) => <g transform={`translate(${x} ${y})`} fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
  <circle cx="8" cy="8" r="8" fill={color} stroke="none" opacity=".16" />
  <path d="m3.8 8.4 2.9 2.9 5.6-6.3" />
</g>

export const BoltGlyph = ({ x, y }: { x: number; y: number }) => <g transform={`translate(${x} ${y})`}>
  <path d="M19 0 2 25h12l-4 21L28 19H15Z" fill={INK} />
</g>

export const SparkGlyph = ({ x, y }: { x: number; y: number }) => <g transform={`translate(${x} ${y})`} fill={INK}>
  <path d="M16 0c1.5 9 4.5 12.5 14 14-9.5 1.5-12.5 5-14 14-1.5-9-4.5-12.5-14-14C11.5 12.5 14.5 9 16 0Z" />
  <path d="M30 22c.6 3.600 1.800 5 5.600 5.600-3.800.6-5 2-5.600 5.600-.6-3.600-1.800-5-5.600-5.600 3.800-.6 5-2 5.600-5.600Z" />
</g>
