/** Randomness for the one decorative layer that varies per visit, the floating fragments. Everything else (cards, screen, travelling light) is deterministic, so the server's still is its first frame. */
export const rand = (min: number, max: number) => min + Math.random() * (max - min)
