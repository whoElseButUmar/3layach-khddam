import * as React from 'react'

import { cn } from '#/lib/utils'

function Badge({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="badge"
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-white/35 bg-white/70 px-2.5 py-1 text-xs font-semibold text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,.75)] backdrop-blur-md',
        className,
      )}
      {...props}
    />
  )
}

export { Badge }
