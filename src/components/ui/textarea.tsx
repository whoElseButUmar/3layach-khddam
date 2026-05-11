import * as React from 'react'

import { cn } from '#/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'field-sizing-content min-h-20 w-full resize-none border-0 bg-transparent text-base leading-6 text-note-ink outline-none placeholder:text-note-ink/40 focus-visible:ring-0',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
