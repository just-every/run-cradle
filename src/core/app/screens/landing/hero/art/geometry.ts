/** Pure geometry for the ribbons: smooth centrelines through waypoints, and tapering outlines around them. Deterministic, so server and client agree. */
export type Pt = readonly [number, number]

const fmt = (p: Pt, places: 0 | 1) => (places === 0 ? `${Math.round(p[0])} ${Math.round(p[1])}` : `${Math.round(p[0] * 10) / 10} ${Math.round(p[1] * 10) / 10}`)

/** Uniform Catmull-Rom spline through the waypoints, as a dense polyline. */
function densePolyline(points: readonly Pt[], perSegment: number): Pt[] {
  const out: Pt[] = []
  const at = (i: number) => points[Math.min(points.length - 1, Math.max(0, i))]
  for (let i = 0; i < points.length - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)]
    for (let s = 0; s < perSegment; s++) {
      const t = s / perSegment, t2 = t * t, t3 = t2 * t
      const k = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
      out.push([k(p0[0], p1[0], p2[0], p3[0]), k(p0[1], p1[1], p2[1], p3[1])])
    }
  }
  out.push(points[points.length - 1])
  return out
}

/** Resamples a polyline at equal arc-length steps. */
export function equalSteps(poly: readonly Pt[], count: number): Pt[] {
  const cumulative = [0]
  for (let i = 1; i < poly.length; i++) cumulative.push(cumulative[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]))
  const total = cumulative[cumulative.length - 1]
  const out: Pt[] = []
  let j = 1
  for (let n = 0; n < count; n++) {
    const target = (total * n) / (count - 1)
    while (j < poly.length - 1 && cumulative[j] < target) j++
    const span = cumulative[j] - cumulative[j - 1] || 1
    const f = (target - cumulative[j - 1]) / span
    out.push([poly[j - 1][0] + (poly[j][0] - poly[j - 1][0]) * f, poly[j - 1][1] + (poly[j][1] - poly[j - 1][1]) * f])
  }
  return out
}

/** A smooth centreline through the waypoints, as `count` points at equal arc-length steps. */
export function centreline(waypoints: readonly Pt[], count: number): Pt[] {
  return equalSteps(densePolyline(waypoints, 14), count)
}

/** An open smooth SVG path through the points (Catmull-Rom as cubic segments). */
export function smoothPath(points: readonly Pt[], moveTo = true, places: 0 | 1 = 1): string {
  const at = (i: number) => points[Math.min(points.length - 1, Math.max(0, i))]
  let d = moveTo ? `M${fmt(points[0], places)}` : ''
  for (let i = 0; i < points.length - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)]
    d += `C${fmt([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], places)} ${fmt([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6], places)} ${fmt(p2, places)}`
  }
  return d
}

/** The points `offset` (a signed fraction of the local width, -0.5 to 0.5) to one side of the centreline, given the width at each of its points. */
function edge(centre: readonly Pt[], widths: readonly number[], offset: number): Pt[] {
  const last = centre.length - 1
  return centre.map((p, i) => {
    const a = centre[Math.max(0, i - 1)], b = centre[Math.min(last, i + 1)]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    const w = widths[i] * offset
    return [p[0] - ((b[1] - a[1]) / len) * w, p[1] + ((b[0] - a[0]) / len) * w] as Pt
  })
}

/** A closed outline of the strip of the ribbon between two fractions of its width, e.g. -0.5..0.5 for all of it. */
export function strip(centre: readonly Pt[], widths: readonly number[], from = -0.5, to = 0.5, places: 0 | 1 = 0): string {
  const a = edge(centre, widths, from), b = edge(centre, widths, to).reverse()
  return `${smoothPath(a, true, places)}L${fmt(b[0], places)}${smoothPath(b, false, places)}Z`
}
