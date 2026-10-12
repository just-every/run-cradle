import type { Ribbon } from './ribbonBuild'

/** The strands that carry travelling light, in the order their lights set out (sides alternating, evenly spaced): the dark strands, where light reads as a sheen on the ribbon rather than as an effect. */
export const sheenOrder: readonly string[] = ['l4', 'r7', 'l9', 'r3', 'l7', 'r10']
export const carriesSheen = (r: Ribbon) => sheenOrder.includes(r.id)

/** The light's drawn radius, which the motion layer scales to the strand (fx/sheenFrames.ts). */
export const SHEEN_R = 100
const PEAK = 0.3
const STOPS = 12

/** A soft disc of light, brightest at its centre and falling away as a bell curve in many stops to nothing at its rim, so it has no edge anywhere. */
export function SheenGradient() {
  return <radialGradient id="lp-sheen">
    {Array.from({ length: STOPS + 1 }, (_, i) => {
      const r = i / STOPS
      return <stop key={i} offset={r.toFixed(3)} stopColor="#dff58e" stopOpacity={i === STOPS ? 0 : Number((PEAK * Math.exp(-((r / 0.5) ** 2))).toFixed(4))} />
    })}
  </radialGradient>
}

/** The light on one strand, painted just above it so nearer strands pass in front of it, and clipped to its outline. It exists only while motion is live and starts out of sight; the motion layer carries it along the strand. */
export function Sheen({ r }: { r: Ribbon }) {
  return <g clipPath={`url(#lp-k-${r.id})`}>
    <ellipse data-sheen={r.id} rx={SHEEN_R} ry={SHEEN_R} fill="url(#lp-sheen)" opacity="0" />
  </g>
}
