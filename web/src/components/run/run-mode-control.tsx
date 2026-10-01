import { ListChecks, Sparkles } from 'lucide-react'
import { SegmentedControl } from '@/components/ui/segmented-control'
import type { RunMode } from '@/lib/api'
import { RUN_MODE_DESCRIPTIONS, RUN_MODE_LABELS } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface RunModeControlProps {
  value: RunMode
  onChange: (mode: RunMode) => void
  /** From the overview; null while unknown. */
  llmAvailable: boolean | null
  disabled?: boolean
  className?: string
}

/** Smart AI / Rules choice with a one-line explanation of the selected mode. */
export function RunModeControl({ value, onChange, llmAvailable, disabled, className }: RunModeControlProps) {
  const offline = llmAvailable === false
  const hint =
    value === 'llm' && offline ? 'Smart AI is offline right now, so this run will use the built-in rules instead.' : RUN_MODE_DESCRIPTIONS[value]

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <span aria-hidden className="text-sm font-medium text-foreground">
        Mode
      </span>
      <SegmentedControl<RunMode>
        aria-label="Assistant mode"
        value={value}
        onChange={onChange}
        disabled={disabled}
        fullWidth
        options={[
          {
            value: 'llm',
            label: RUN_MODE_LABELS.llm,
            icon: <Sparkles aria-hidden />,
            description: offline ? 'Offline: runs fall back to the built-in rules' : RUN_MODE_DESCRIPTIONS.llm,
          },
          { value: 'rules', label: RUN_MODE_LABELS.rules, icon: <ListChecks aria-hidden />, description: RUN_MODE_DESCRIPTIONS.rules },
        ]}
      />
      <p className="text-xs text-muted" aria-live="polite">
        {hint}
      </p>
    </div>
  )
}
