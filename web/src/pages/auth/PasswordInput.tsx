import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { Input, type InputProps } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * Password field with a show/hide toggle. Takes every Input prop (Field passes id,
 * aria-describedby and aria-invalid through), including `ref`.
 */
export function PasswordInput({ className, ...props }: Omit<InputProps, 'type'>) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className={cn('pr-10', className)} />
      <button
        type="button"
        aria-label="Show password"
        aria-pressed={visible}
        aria-controls={props.id}
        onClick={() => setVisible((v) => !v)}
        className="absolute top-1/2 right-1 flex size-7 -translate-y-1/2 items-center justify-center rounded-sm text-subtle transition-colors duration-150 ease-out hover:bg-surface-2 hover:text-foreground focus-visible:outline-offset-0 sm:size-6"
      >
        {visible ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
      </button>
    </div>
  )
}
