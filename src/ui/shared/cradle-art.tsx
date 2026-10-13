import { useId } from 'react'
import { ribbonColours } from './ribbon'
import { MiniRecords } from './cradle-art-screen'

type Variant = 'welcome' | 'empty' | 'broken'

/** Cradle's in-app artwork: a small Records screen drawn with real labels, with ribbon bands running into and out of it, or (broken) two strands with a lime thread that breaks off. Static and decorative. */
export function CradleArt({ variant }: { variant: Variant }) {
  const id = `cr-art-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  if (variant === 'broken') return <svg className="cr-art cr-art--broken" viewBox="0 0 1000 160" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <path d="M0 118 C110 128 200 40 340 62" stroke={ribbonColours.sage} strokeWidth="8" fill="none" strokeLinecap="round" opacity=".75" vectorEffect="non-scaling-stroke" />
    <path d="M660 74 C740 52 790 56 836 72" stroke={ribbonColours.sage} strokeWidth="8" fill="none" strokeLinecap="round" opacity=".75" vectorEffect="non-scaling-stroke" />
    <path d="M852 79 L874 90" stroke={ribbonColours.lime} strokeWidth="8" fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    <path d="M892 99 C930 118 966 118 1000 100" stroke={ribbonColours.sage} strokeWidth="8" fill="none" strokeLinecap="round" opacity=".75" vectorEffect="non-scaling-stroke" />
  </svg>
  return <svg className={`cr-art cr-art--${variant}`} viewBox="40 8 480 264" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-in`} x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor={ribbonColours.lime} stopOpacity="0" /><stop offset=".55" stopColor={ribbonColours.lime} /><stop offset="1" stopColor={ribbonColours.limeEnd} /></linearGradient>
      <linearGradient id={`${id}-out`} x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor={ribbonColours.lime} /><stop offset=".5" stopColor={ribbonColours.sage} /><stop offset="1" stopColor={ribbonColours.sage} stopOpacity="0" /></linearGradient>
      <clipPath id={`${id}-screen`}><rect x="120" y="24" width="320" height="232" rx="16" /></clipPath>
    </defs>
    <path d="M44 206 C78 198 96 152 126 120 L126 154 C102 172 80 222 44 226 Z" fill={`url(#${id}-in)`} />
    <path d="M434 92 C468 88 490 140 516 160 L516 184 C488 168 468 124 434 126 Z" fill={`url(#${id}-out)`} />
    <rect x="124" y="32" width="320" height="232" rx="16" fill="#12372e" opacity=".07" />
    <g clipPath={`url(#${id}-screen)`}>
      <rect x="120" y="24" width="320" height="232" fill="#fffefd" />
      <MiniRecords variant={variant} />
    </g>
    <rect x="120.5" y="24.5" width="319" height="231" rx="15.5" fill="none" stroke="#12372e" strokeOpacity=".12" />
  </svg>
}
