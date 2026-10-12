/** The ribbons' three depth bands. Within the one camera (camera.ts) the strands lie on nested sheets of the funnel: far strands are slimmer and paler, near ones bolder. */
export type Layer = 0 | 1 | 2

export type LayerSpec = {
  name: 'far' | 'middle' | 'near'
  ribbonWidth: number
  ribbonOpacity: number
}

export const LAYERS: readonly LayerSpec[] = [
  { name: 'far', ribbonWidth: 0.82, ribbonOpacity: 0.78 },
  { name: 'middle', ribbonWidth: 1, ribbonOpacity: 1 },
  { name: 'near', ribbonWidth: 1.12, ribbonOpacity: 1 },
]
