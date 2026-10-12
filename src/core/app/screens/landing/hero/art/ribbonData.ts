import type { Pt } from './geometry'

export type Tone = 'dark' | 'lime' | 'sage' | 'mist' | 'hair'

export type RibbonSpec = {
  id: string
  side: 'l' | 'r'
  tone: Tone
  /** Waypoints from the outer edge to the screen. */
  way: readonly Pt[]
  /** Width at the page edge. Along the strand it narrows exactly as the camera foreshortens the funnel it lies on. */
  from: number
  opacity?: number
  /** A lighter strip along the ribbon, as fractions of its width. */
  inner?: readonly [number, number]
}

/** The ribbons, in paint order, authored in the approved image's pixels. Left strands end behind the screen's left edge (x 480), right strands behind its right edge (x 1057). */
export const ribbonSpecs: readonly RibbonSpec[] = [
  // Left: soft mist washes first, then layered strands, thin dark hairlines last.
  { id: 'l0', side: 'l', tone: 'mist', way: [[-150, 205], [120, 268], [330, 380], [500, 575]], from: 118, opacity: 0.7 },
  { id: 'l1', side: 'l', tone: 'mist', way: [[-150, 470], [130, 500], [330, 560], [500, 612]], from: 100, opacity: 0.65 },
  { id: 'l2', side: 'l', tone: 'sage', way: [[-150, 350], [60, 372], [250, 450], [390, 530], [500, 592]], from: 72, opacity: 0.9, inner: [-0.5, -0.05] },
  { id: 'l3', side: 'l', tone: 'lime', way: [[-150, 308], [110, 318], [300, 392], [410, 506], [500, 590]], from: 48 },
  { id: 'l4', side: 'l', tone: 'dark', way: [[-150, 322], [70, 338], [240, 408], [370, 495], [500, 576]], from: 60, inner: [0.1, 0.5] },
  { id: 'l5', side: 'l', tone: 'lime', way: [[-150, 506], [90, 482], [250, 480], [390, 548], [500, 606]], from: 40 },
  { id: 'l6', side: 'l', tone: 'sage', way: [[-150, 560], [100, 568], [300, 586], [420, 606], [500, 624]], from: 60, opacity: 0.92, inner: [-0.5, 0.0] },
  { id: 'l7', side: 'l', tone: 'dark', way: [[-150, 600], [60, 596], [240, 588], [380, 616], [500, 628]], from: 56, inner: [0.05, 0.45] },
  { id: 'l8', side: 'l', tone: 'mist', way: [[-150, 668], [110, 640], [320, 640], [500, 646]], from: 86, opacity: 0.8 },
  { id: 'l9', side: 'l', tone: 'dark', way: [[-150, 748], [40, 740], [210, 698], [370, 650], [500, 640]], from: 78, inner: [-0.45, 0.0] },
  { id: 'l10', side: 'l', tone: 'lime', way: [[-150, 770], [120, 752], [300, 706], [500, 656]], from: 44 },
  { id: 'l11', side: 'l', tone: 'sage', way: [[-150, 836], [80, 800], [290, 730], [500, 660]], from: 76, opacity: 0.75, inner: [-0.5, 0.05] },
  { id: 'l12', side: 'l', tone: 'hair', way: [[-150, 400], [150, 420], [330, 500], [500, 598]], from: 3, opacity: 0.9 },
  { id: 'l13', side: 'l', tone: 'hair', way: [[-150, 640], [160, 612], [330, 622], [500, 634]], from: 3, opacity: 0.9 },
  { id: 'l14', side: 'l', tone: 'hair', way: [[-150, 255], [120, 292], [300, 372], [500, 585]], from: 2.5, opacity: 0.8 },
  // Right: a different order of the same palette, fanning out to the right edge.
  { id: 'r0', side: 'r', tone: 'mist', way: [[1686, 330], [1420, 336], [1240, 432], [1036, 548]], from: 118, opacity: 0.7 },
  { id: 'r1', side: 'r', tone: 'sage', way: [[1686, 458], [1420, 446], [1230, 520], [1036, 566]], from: 84, opacity: 0.88, inner: [-0.5, 0.0] },
  { id: 'r2', side: 'r', tone: 'lime', way: [[1686, 352], [1450, 332], [1270, 410], [1160, 506], [1036, 560]], from: 46 },
  { id: 'r3', side: 'r', tone: 'dark', way: [[1686, 438], [1470, 440], [1320, 470], [1180, 536], [1036, 574]], from: 62, inner: [0.05, 0.5] },
  { id: 'r4', side: 'r', tone: 'lime', way: [[1686, 548], [1420, 520], [1250, 506], [1120, 540], [1036, 590]], from: 44 },
  { id: 'r5', side: 'r', tone: 'sage', way: [[1686, 618], [1440, 586], [1260, 588], [1120, 600], [1036, 610]], from: 70, opacity: 0.85, inner: [-0.5, 0.05] },
  { id: 'r6', side: 'r', tone: 'mist', way: [[1686, 680], [1440, 668], [1260, 640], [1036, 626]], from: 96, opacity: 0.75 },
  { id: 'r7', side: 'r', tone: 'dark', way: [[1686, 826], [1500, 800], [1320, 752], [1170, 686], [1036, 640]], from: 80, inner: [-0.45, 0.05] },
  { id: 'r8', side: 'r', tone: 'lime', way: [[1686, 724], [1460, 704], [1280, 676], [1160, 646], [1036, 626]], from: 48 },
  { id: 'r9', side: 'r', tone: 'sage', way: [[1686, 770], [1440, 760], [1280, 720], [1036, 648]], from: 78, opacity: 0.7, inner: [-0.5, 0.0] },
  { id: 'r10', side: 'r', tone: 'dark', way: [[1686, 540], [1500, 560], [1330, 590], [1180, 604], [1036, 616]], from: 38, inner: [0.0, 0.45] },
  { id: 'r11', side: 'r', tone: 'hair', way: [[1686, 392], [1440, 400], [1260, 466], [1036, 570]], from: 3, opacity: 0.9 },
  { id: 'r12', side: 'r', tone: 'hair', way: [[1686, 660], [1450, 630], [1250, 612], [1036, 618]], from: 3, opacity: 0.9 },
  // Slim companion strands that give the bundles their density.
  { id: 'l17', side: 'l', tone: 'sage', way: [[-150, 436], [100, 462], [260, 514], [380, 548], [500, 600]], from: 24, opacity: 0.9 },
  { id: 'l18', side: 'l', tone: 'dark', way: [[-150, 262], [160, 322], [330, 428], [500, 582]], from: 22 },
  { id: 'l19', side: 'l', tone: 'lime', way: [[-150, 626], [100, 656], [260, 664], [500, 634]], from: 20, opacity: 0.8 },
  { id: 'l20', side: 'l', tone: 'sage', way: [[-150, 722], [120, 716], [330, 686], [500, 652]], from: 28, opacity: 0.9 },
  { id: 'l21', side: 'l', tone: 'dark', way: [[-150, 818], [100, 792], [300, 732], [500, 666]], from: 26 },
  { id: 'r15', side: 'r', tone: 'sage', way: [[1686, 298], [1440, 312], [1260, 392], [1036, 552]], from: 28, opacity: 0.9 },
  { id: 'r16', side: 'r', tone: 'dark', way: [[1686, 592], [1440, 562], [1260, 592], [1036, 606]], from: 24 },
  { id: 'r17', side: 'r', tone: 'lime', way: [[1686, 498], [1440, 484], [1260, 522], [1036, 582]], from: 20, opacity: 0.8 },
  { id: 'r18', side: 'r', tone: 'sage', way: [[1686, 742], [1440, 722], [1260, 692], [1036, 642]], from: 30, opacity: 0.9 },
  { id: 'r19', side: 'r', tone: 'dark', way: [[1686, 874], [1450, 828], [1280, 762], [1036, 652]], from: 30 },
  // Frosted veils over the strands, for depth.
  { id: 'l15', side: 'l', tone: 'mist', way: [[-150, 395], [120, 420], [330, 500], [500, 585]], from: 90, opacity: 0.45 },
  { id: 'l16', side: 'l', tone: 'mist', way: [[-150, 700], [110, 700], [320, 668], [500, 640]], from: 70, opacity: 0.4 },
  { id: 'r13', side: 'r', tone: 'mist', way: [[1686, 400], [1440, 410], [1250, 480], [1036, 565]], from: 90, opacity: 0.4 },
  { id: 'r14', side: 'r', tone: 'mist', way: [[1686, 700], [1440, 690], [1260, 660], [1036, 632]], from: 80, opacity: 0.4 },
]
