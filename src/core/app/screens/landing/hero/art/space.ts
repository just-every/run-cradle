/** The hero art's coordinate space. Artwork is authored in the approved image's pixels: 1536 wide, and the 730px band that starts 175px below the image's top edge. */
export const ART_W = 1536
export const ART_H = 730
export const ART_TOP = 175
export const ART_VIEWBOX = `0 ${ART_TOP} ${ART_W} ${ART_H}`

/** How far the scene reaches beyond each side of the approved 1536 units, in art units: wide enough to fill a 5120px-wide screen, where art units are pixels. The ribbons are drawn this far out at every width, plus OVERHANG so their cut ends always lie past the page edge; the hero clips what a screen does not show. */
export const ART_REACH = 1792
const OVERHANG = 200
export const ART_LEFT = -(ART_REACH + OVERHANG)
export const ART_RIGHT = ART_W + ART_REACH + OVERHANG

const fixed = (n: number) => Number(n.toFixed(3))

/** Left edge or width as a percentage of the art's width, for an x-length in art units. */
export const pctX = (n: number) => `${fixed((n / ART_W) * 100)}%`
/** Top edge or height as a percentage of the art's height, for a y position in art units. */
export const pctY = (y: number) => `${fixed(((y - ART_TOP) / ART_H) * 100)}%`
/** A length in art units as container-query width units: 1cqw is 1% of the art's width. */
export const cqw = (n: number) => fixed((n / ART_W) * 100)
