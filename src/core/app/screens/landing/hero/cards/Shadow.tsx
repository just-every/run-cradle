const STEPS = 9
/** The shadow a card casts on the ribbons below it, in the card's own units: drop, spread and total opacity. It is drawn with the card, so the camera scales it with the card: nearer cards cast larger, softer-looking shadows. */
const DROP = 11
const SPREAD = 16
const ALPHA = 0.14
const FILL = '#294c3a'

/** A card's shadow, softened ahead of time as stacked shapes of falling opacity, so nothing blurs while it moves. Rounded rectangle, or a circle when `round`. */
export function Shadow({ w, h, round }: { w: number; h: number; round?: boolean }) {
  const shapes = Array.from({ length: STEPS }, (_, i) => {
    const grow = SPREAD * (1 - i / STEPS)
    return { grow, top: DROP * (1 - i / (STEPS * 2)) - grow, opacity: ALPHA / STEPS }
  })
  return <g aria-hidden="true">
    {shapes.map(({ grow, top, opacity }, i) => round
      ? <ellipse key={i} cx={w / 2} cy={h / 2 + top + grow} rx={w / 2 + grow} ry={h / 2 + grow} fill={FILL} opacity={opacity} />
      : <rect key={i} x={-grow} y={top} width={w + grow * 2} height={h + grow * 2} rx={11 + grow} fill={FILL} opacity={opacity} />)}
    {round
      ? <ellipse cx={w / 2} cy={h / 2 + 1.5} rx={w / 2 + 0.5} ry={h / 2 + 0.5} fill={FILL} opacity="0.1" />
      : <rect x="-0.5" y="1.5" width={w + 1} height={h + 1} rx="11.5" fill={FILL} opacity="0.1" />}
  </g>
}
