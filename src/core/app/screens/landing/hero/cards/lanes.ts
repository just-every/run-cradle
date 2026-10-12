import type { Pt } from '../art/geometry'

export type LaneSpec = {
  id: string
  side: 'l' | 'r'
  /** Waypoints in art units: from beyond the page edge, through the card's place in the composed still, to under the Projects screen. */
  way: readonly Pt[]
  /** How far a swoop along it bows out to the side, in art units, where the default would carry it over the copy. */
  bow?: number
}

/** The x of the Projects screen's left and right edges in art units: where a lane passes under the screen. */
export const SCREEN_EDGE = { l: 480, r: 1057 } as const

/** One lane per card, six a side, mirrored roughly as in the approved image. Each lane runs along the ribbons from beyond the page edge, through its card's place in the approved image, to under the screen's edge, and is routed clear of its neighbours' places, so a card drifting home or drawn into the screen never passes over another. Listed top to bottom on each side. */
export const laneSpecs: readonly LaneSpec[] = [
  { id: 'sheet', side: 'l', way: [[-170, 177], [0, 222], [159, 285], [285, 288], [352, 306], [408, 340], [450, 400], [480, 470], [498, 545], [512, 615]], bow: 0 },
  { id: 'list', side: 'l', way: [[-170, 362], [0, 374], [150, 386], [311, 378], [415, 452], [480, 518], [600, 590]] },
  { id: 'contact', side: 'l', way: [[-170, 455], [0, 466], [118, 479], [250, 489], [370, 496], [440, 515], [480, 540], [600, 586]] },
  { id: 'link-l', side: 'l', way: [[-170, 560], [0, 560], [190, 556], [330, 545], [420, 568], [480, 594], [600, 627]] },
  { id: 'csv', side: 'l', way: [[-170, 626], [0, 634], [161, 640], [320, 640], [420, 638], [480, 640], [600, 646]] },
  { id: 'notes', side: 'l', way: [[-170, 860], [0, 822], [249, 758], [380, 716], [480, 690], [600, 669]] },
  { id: 'calendar', side: 'r', way: [[1706, 179], [1536, 232], [1327, 307], [1200, 382], [1110, 446], [1057, 486], [937, 557], [880, 600]] },
  { id: 'checks', side: 'r', way: [[1706, 357], [1536, 376], [1403, 408], [1290, 424], [1190, 442], [1110, 472], [1057, 506], [937, 559]] },
  { id: 'link-r', side: 'r', way: [[1706, 516], [1536, 516], [1340, 514], [1191, 508], [1110, 536], [1057, 564], [937, 594]] },
  { id: 'bolt', side: 'r', way: [[1706, 584], [1536, 584], [1345, 588], [1200, 598], [1057, 606], [937, 612]] },
  { id: 'doc', side: 'r', way: [[1706, 690], [1536, 682], [1350, 676], [1237, 678], [1130, 668], [1057, 652], [937, 634]] },
  { id: 'brief', side: 'r', way: [[1706, 894], [1536, 864], [1327, 803], [1180, 750], [1057, 704], [937, 674]] },
]
