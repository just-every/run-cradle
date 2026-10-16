import { BrandMark } from './brand-mark'
import type { P3Variant } from './brand-geometry'
import './brand-lockup.css'

type BrandLockupProps = {
  name: string
  /** Bare-mark variant for the ground the lockup sits on: `paper` (light) or `dark`. */
  variant: Exclude<P3Variant, 'tile'>
  className?: string
  runtimeLabel?: boolean
}

/** The P3 mark with its wordmark. Sized entirely in em, so the parent's font-size sets the lockup's size. */
export const BrandLockup = ({ name, variant, className = '', runtimeLabel = false }: BrandLockupProps) => (
  <span className={`brand-lockup ${className}`.trim()}>
    <BrandMark className="brand-lockup-mark" variant={variant} />
    <span className="brand-lockup-word" data-rer-name={runtimeLabel ? true : undefined}>{name}</span>
  </span>
)
