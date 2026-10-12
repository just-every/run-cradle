import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'

import { cn } from './cn'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-70',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
        accent: 'border border-primary/15 bg-accent text-accent-foreground shadow-[0_10px_24px_rgba(31,46,49,0.12)] hover:brightness-95',
        outline: 'border border-border bg-card shadow-sm hover:border-primary/30 hover:bg-white',
        ghost: 'hover:bg-accent/35 hover:text-foreground',
      },
      size: {
        default: 'min-h-10 px-4 py-2',
        compact: 'min-h-9 px-3 py-1.5 text-xs',
        identity: 'min-h-16 w-full px-6 text-lg',
        icon: 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }

export const Button = ({ asChild = false, className, size, variant, ...props }: ButtonProps) => {
  const Component = asChild ? Slot : 'button'

  return <Component className={cn(buttonVariants({ size, variant }), className)} {...props} />
}
