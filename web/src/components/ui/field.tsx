import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Label } from './label'

export interface FieldProps {
  label: ReactNode
  /** One control (Input, Textarea, ...). Field wires up id, aria-describedby and aria-invalid. */
  children: ReactElement<Record<string, unknown>>
  /** Helper text under the control. */
  hint?: ReactNode
  /** Error text; also marks the control invalid. */
  error?: ReactNode
  optional?: boolean
  /** Use a fixed id (otherwise one is generated). */
  id?: string
  className?: string
  /** Extra content on the right of the label row (e.g. a "Use sample" button). */
  labelAside?: ReactNode
}

/**
 * Label + control + hint/error, accessibly connected.
 *
 * <Field label="Email" error={errors.email}><Input type="email" autoComplete="email" /></Field>
 */
export function Field({ label, children, hint, error, optional, id, className, labelAside }: FieldProps) {
  const generated = useId()
  const controlId = id ?? (children.props.id as string | undefined) ?? generated
  const hintId = hint ? `${controlId}-hint` : undefined
  const errorId = error ? `${controlId}-error` : undefined
  const describedBy = [children.props['aria-describedby'] as string | undefined, hintId, errorId].filter(Boolean).join(' ') || undefined

  const control = isValidElement(children)
    ? cloneElement(children, {
        id: controlId,
        'aria-describedby': describedBy,
        ...(error ? { 'aria-invalid': true } : {}),
      })
    : children

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex min-h-5 items-center justify-between gap-2">
        <Label htmlFor={controlId} optional={optional}>
          {label}
        </Label>
        {labelAside}
      </div>
      {control}
      {hint && !error ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {hint && error ? (
        <p id={hintId} className="sr-only">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
