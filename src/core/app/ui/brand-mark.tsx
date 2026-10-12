import { p3Layers, type P3Variant } from './brand-geometry'

type BrandMarkProps = {
  className?: string
  /** `tile` (default) is the app icon on its dark rounded tile; `paper` and `dark` draw the bare mark for light and dark grounds; `mono` follows currentColor. */
  variant?: P3Variant
}

/** Logo P3. Every variant draws plain paths from brand-geometry, so the mark can repeat on a page without duplicate ids. */
export const BrandMark = ({ className = '', variant = 'tile' }: BrandMarkProps) => {
  const { viewBox, tile, transform, c, disc } = p3Layers(variant)
  const glyph = (
    <>
      <path d={c.d} fill={c.fill} />
      <circle cx={disc.cx} cy={disc.cy} r={disc.r} fill={disc.fill} />
    </>
  )
  return (
    <svg aria-hidden="true" className={className} fill="none" focusable="false" viewBox={viewBox}>
      {tile ? (
        <>
          <rect fill={tile.fill} height={tile.size} rx={tile.radius} width={tile.size} />
          <g transform={transform}>{glyph}</g>
        </>
      ) : (
        glyph
      )}
    </svg>
  )
}
