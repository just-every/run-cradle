/** A short ribbon strand that slides in from a screen's outer edge, tucked behind it. */
export function Strand({ side }: { side: 'left' | 'right' }) {
  return <svg className={`lp-strand lp-strand--${side}`} aria-hidden="true" focusable="false"><use href="#lp-strand" /></svg>
}
