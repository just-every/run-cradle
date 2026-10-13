import { ribbonColours } from './ribbon'

/** The inside of the artwork's screen (x 120–440, y 24–256): the forest rail with its icons, then the Records table drawn with real labels. */
const sans = '"Cradle Sans", ui-sans-serif, system-ui, sans-serif'
const ink = '#12372e', muted = '#52695f', line = '#12372e1a'
const chip = { High: ['#f6d9d2', '#823626'], Medium: ['#f5ebae', '#5a4a07'], Low: ['#cde6cf', '#1f5a3a'] } as const
const tasks = [['Write homepage copy', 'High', '2026-10-24'], ['Photograph spring range', 'Medium', '2026-11-03'], ['Review leave policy', 'Low', '2026-10-15'], ['Book removal van', 'High', '2026-12-12'], ['Order stand banners', 'Medium', '2027-01-20']] as const

function Pill({ x, y, label, fill, color = ink, dashed = false }: { x: number; y: number; label: string; fill: string; color?: string; dashed?: boolean }) {
  const width = label.length * 5.4 + 20
  return <g>
    <rect x={x} y={y} width={width} height="18" rx="9" fill={fill} {...(dashed ? { stroke: '#9fb2a6', strokeDasharray: '3 2.5' } : {})} />
    <text x={x + width / 2} y={y + 12.4} textAnchor="middle" fontFamily={sans} fontSize="9" fontWeight="600" fill={color}>{label}</text>
  </g>
}

function Rail() {
  return <g>
    <rect x="120" y="24" width="50" height="232" fill="#0d302c" />
    <circle cx="145" cy="48" r="5" fill={ribbonColours.lime} />
    <path d="M151.8 42.4a9 9 0 1 0 2.2 9.3" stroke="#edf3eb" strokeWidth="2.6" fill="none" strokeLinecap="round" />
    <g fill="none" stroke="#b1c7bc" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="m138 86 7-5.5 7 5.5v7.5h-14z" />
      <g stroke={ribbonColours.lime}><rect x="138" y="106" width="14" height="12" rx="1.5" /><path d="M138 110h14M143 106v12" /></g>
      <path d="m145 132-7 3.5 7 3.5 7-3.5zM138 139.5l7 3.5 7-3.5" />
    </g>
    <rect x="120" y="102" width="3" height="20" rx="1.5" fill={ribbonColours.lime} />
  </g>
}

export function MiniRecords({ variant }: { variant: 'welcome' | 'empty' }) {
  const columns = variant === 'welcome' ? [['Task', 184], ['Priority', 306], ['Due date', 366]] as const : [['Name', 184]] as const
  return <g>
    <Rail />
    {variant === 'welcome'
      ? <><Pill x={184} y={40} label="Projects" fill="#eef0ea" color="#4f665c" /><Pill x={247} y={40} label="Tasks" fill={ribbonColours.lime} /></>
      : <><Pill x={184} y={40} label="Table 1" fill={ribbonColours.lime} /><Pill x={243} y={40} label="Add table" fill="none" color={muted} dashed /></>}
    {columns.map(([label, x]) => <text key={label} x={x} y="82" fontFamily={sans} fontSize="9" fontWeight="600" fill={ink}>{label}</text>)}
    <path d="M184 92 H428" stroke={line} />
    {variant === 'welcome'
      ? tasks.map(([name, level, due], row) => { const y = 112 + row * 29, [fill, color] = chip[level]; return <g key={name}>
          <text x="184" y={y} fontFamily={sans} fontSize="9" fontWeight="500" fill={ink}>{name}</text>
          <rect x="306" y={y - 11} width={level.length * 5 + 14} height="15" rx="7.5" fill={fill} />
          <text x="313" y={y} fontFamily={sans} fontSize="8.5" fontWeight="600" fill={color}>{level}</text>
          <text x="366" y={y} fontFamily={sans} fontSize="8.5" fill={muted}>{due}</text>
          <path d={`M184 ${y + 11} H428`} stroke={line} />
        </g> })
      : <>{[0, 1, 2, 3].map(row => <path key={row} d={`M184 ${120 + row * 28} H428`} stroke={line} />)}<Pill x={184} y={222} label="Add field" fill="none" color={muted} dashed /></>}
  </g>
}
