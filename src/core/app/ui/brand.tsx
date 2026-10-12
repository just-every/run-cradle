type BrandProps = {
  name: string
}

export const Brand = ({ name }: BrandProps) => (
  <span className="font-semibold tracking-[-0.03em] text-foreground">{name}</span>
)
