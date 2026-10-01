import { useQueryClient } from '@tanstack/react-query'
import { FileText, RotateCcw } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { RunModeControl, RunPanel, useAgentRun, useRunMode } from '@/components/run'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { PageHeader } from '@/components/ui/page-header'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast'
import { errorMessage, getSampleConversation } from '@/lib/api'
import { queryKeys } from '@/lib/query'

const MAX_CHARS = 50_000

const PLACEHOLDER = [
  'From: Karan Malhotra <karan@urbanbrew.in>',
  'To: Alex <alex@acmesolutions.in>',
  'Date: 2026-09-28 11:20 IST',
  'Subject: HR and payroll for 3 cafes',
  '',
  'Hi Alex, could you share pricing…',
  '---',
  'From: Alex <alex@acmesolutions.in>',
  '…',
].join('\n')

const EMAIL = /[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+/

function validate(text: string): string | null {
  if (!text.trim()) return 'Paste a conversation first, or use the sample.'
  if (!EMAIL.test(text)) return 'Include the contact’s email address, for example in a “From: Name <email>” line, so the assistant knows who to follow up with.'
  return null
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

const PANEL_TEXT = {
  idle: 'Each step lights up as the assistant works through your conversation.',
  running: 'Working through the steps. This usually takes a few seconds.',
  done: 'Finished. Every step it took is also in the activity log.',
  failed: 'The run stopped early. Anything it did before stopping is in the activity log.',
} as const

/** Paste a conversation and watch the assistant decide what to do with it. */
export default function NewFollowUp() {
  const client = useQueryClient()
  const run = useAgentRun()
  const { mode, setMode, llmAvailable } = useRunMode()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loadingSample, setLoadingSample] = useState(false)
  const [confirmSample, setConfirmSample] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  const loadSample = async () => {
    setConfirmSample(false)
    setLoadingSample(true)
    try {
      const sample = await client.fetchQuery({
        queryKey: queryKeys.sample,
        queryFn: ({ signal }) => getSampleConversation(signal),
        staleTime: Infinity,
      })
      setText(sample.text)
      setError(null)
      textareaRef.current?.focus()
    } catch (e) {
      toast.error('Could not load the sample conversation', errorMessage(e))
    } finally {
      setLoadingSample(false)
    }
  }

  const onUseSample = () => {
    if (text.trim()) setConfirmSample(true)
    else void loadSample()
  }

  const startRun = () => {
    const problem = validate(text)
    setError(problem)
    if (problem) {
      textareaRef.current?.focus()
      return
    }
    void run.start({ text: text.trim(), mode })
    window.requestAnimationFrame(() => panelRef.current?.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' }))
  }

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    startRun()
  }

  const startOver = () => {
    run.reset()
    setText('')
    setError(null)
    textareaRef.current?.focus()
  }

  return (
    <>
      <PageHeader
        title="New follow-up"
        description="Paste an email conversation. The assistant saves it, checks earlier emails to the same person, decides whether a follow-up is needed, picks the time and drafts it."
      />

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px] xl:items-start">
        <Card>
          <form onSubmit={onSubmit} noValidate aria-label="Conversation to analyse">
            <CardContent className="space-y-5 pt-5">
              <Field
                label="Conversation"
                error={error}
                hint="Start each message with From, To, Date and Subject lines, and separate messages with a line of three dashes (---). The contact type is detected from the wording."
                labelAside={
                  <Button variant="ghost" size="sm" className="-mr-2" onClick={onUseSample} loading={loadingSample} disabled={run.running}>
                    {loadingSample ? null : <FileText aria-hidden />}
                    Use sample
                  </Button>
                }
              >
                <Textarea
                  ref={textareaRef}
                  mono
                  rows={16}
                  value={text}
                  maxLength={MAX_CHARS}
                  readOnly={run.running}
                  spellCheck={false}
                  placeholder={PLACEHOLDER}
                  onChange={(e) => {
                    setText(e.target.value)
                    if (error) setError(null)
                  }}
                />
              </Field>
              <RunModeControl value={mode} onChange={setMode} llmAvailable={llmAvailable} disabled={run.running} />
            </CardContent>
            <CardFooter className="flex-wrap justify-between gap-3">
              <span className="text-xs text-subtle tabular-nums">
                {text.length.toLocaleString('en-IN')} / {MAX_CHARS.toLocaleString('en-IN')} characters
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {run.phase === 'done' || run.phase === 'failed' ? (
                  <Button variant="ghost" onClick={startOver}>
                    <RotateCcw aria-hidden />
                    Start over
                  </Button>
                ) : null}
                <Button type="submit" variant="primary" loading={run.running}>
                  {run.running ? 'Working…' : 'Let the assistant decide'}
                </Button>
              </div>
            </CardFooter>
          </form>
        </Card>

        <div ref={panelRef} className="scroll-mt-20">
          <Card>
            <CardHeader>
              <div className="min-w-0">
                <CardTitle>Assistant</CardTitle>
                <CardDescription>{PANEL_TEXT[run.phase]}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <RunPanel
                run={run}
                onRetry={startRun}
                linkToConversation
                idleContent={
                  <p className="text-sm text-muted">
                    It never sends a duplicate, never chases someone who already replied, and only sends inside the recipient’s business hours.
                  </p>
                }
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmSample}
        onOpenChange={setConfirmSample}
        title="Replace your text with the sample?"
        description="The conversation you pasted will be cleared."
        confirmLabel="Use sample"
        cancelLabel="Keep my text"
        onConfirm={() => void loadSample()}
      />
    </>
  )
}
