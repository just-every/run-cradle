import type { Layer } from './depth'

/** Which depth layer each strand belongs to. Pale washes and sage strands sit far back, lime strands in the middle, dark and veiling strands up front. Unlisted strands are middle. */
export const ribbonLayer: Readonly<Record<string, Layer>> = {
  l0: 0, l1: 0, l2: 0, l11: 0, l12: 0, l14: 0, l17: 0, l20: 0,
  l3: 1, l6: 1, l8: 1, l10: 1, l19: 1,
  l4: 2, l5: 2, l7: 2, l9: 2, l13: 2, l15: 2, l16: 2, l18: 2, l21: 2,
  r0: 0, r4: 0, r5: 0, r6: 0, r9: 0, r11: 0, r12: 0, r15: 0, r18: 0,
  r1: 1, r2: 1, r8: 1, r16: 1, r17: 1,
  r3: 2, r7: 2, r10: 2, r13: 2, r14: 2, r19: 2,
}
