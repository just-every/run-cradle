export type IconName = 'link' | 'check' | 'spark'

/** One of the line icons defined in `Defs`. Always decorative. */
export function Icon({ name }: { name: IconName }) {
  return <svg className="lp-ic" aria-hidden="true" focusable="false"><use href={`#lp-i-${name}`} /></svg>
}
