import { Box } from 'lucide-react'
import { cn } from '@/lib/utils'

// The app's logo mark: a box icon in a primary rounded square. Decorative — the
// surrounding link or text carries the brand name.
export interface BrandMarkProps {
  className?: string
  iconClassName?: string
}

export function BrandMark({ className, iconClassName }: BrandMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground',
        className,
      )}
    >
      <Box className={cn('size-5', iconClassName)} />
    </span>
  )
}
