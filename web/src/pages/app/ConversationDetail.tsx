import { ArrowLeft, MessagesSquare } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ContactPanel } from '@/components/conversation/contact-panel'
import { ConversationActivity } from '@/components/conversation/conversation-activity'
import { MessageThread } from '@/components/conversation/message-thread'
import { SimulateReplyDialog } from '@/components/conversation/simulate-reply-dialog'
import { usePageTitle } from '@/components/layout/page-title'
import { RunModeControl, RunPanel, useAgentRun, useRunMode } from '@/components/run'
import { ContactTypeBadge, ConversationStatusBadge } from '@/components/status-badges'
import { InlineError } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton, SkeletonText } from '@/components/ui/skeleton'
import { ApiError, type ConversationDetail as Conversation } from '@/lib/api'
import { contactTypeLabel, conversationHeadline, firstName } from '@/lib/format'
import { useConversation } from '@/lib/queries'

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** "a customer", "an employee". */
function withArticle(noun: string): string {
  return `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`
}

const backLink = (
  <Link to="/app/conversations" className="inline-flex items-center gap-1.5 rounded-sm hover:text-foreground">
    <ArrowLeft aria-hidden className="size-4" />
    Conversations
  </Link>
)

/* ------------------------------------------------------------------ assistant card */

function AssistantCard({ conversation }: { conversation: Conversation }) {
  const run = useAgentRun()
  const { mode, setMode, llmAvailable } = useRunMode()
  const panelRef = useRef<HTMLDivElement | null>(null)
  const first = firstName(conversation.contact.name)
  const hasPending = conversation.followups.some((f) => f.status === 'pending')
  const typeLabel = contactTypeLabel(conversation.contact.type).toLowerCase()

  const start = () => {
    void run.start({ thread_id: conversation.id, mode })
    // On narrow screens the panel can be below the fold; bring it into view once it renders.
    window.requestAnimationFrame(() => panelRef.current?.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' }))
  }

  let note: string | null = null
  if (conversation.status === 'closed') note = `This conversation is closed, so the assistant will not contact ${first} again.`
  else if (hasPending) note = 'A follow-up is already scheduled. Running again shows how a duplicate is blocked.'

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Assistant</CardTitle>
          <CardDescription>
            Reads this thread and earlier emails, decides whether {first} needs a follow-up, picks a time that suits {withArticle(typeLabel)}, drafts
            it and schedules it.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <RunModeControl value={mode} onChange={setMode} llmAvailable={llmAvailable} disabled={run.running} />
        <Button variant="primary" className="w-full" onClick={start} loading={run.running}>
          {run.running ? 'Working…' : run.phase === 'idle' ? 'Let the assistant decide' : 'Run again'}
        </Button>
        {note ? <p className="text-xs text-muted">{note}</p> : null}
      </CardContent>
      {run.phase === 'idle' ? null : (
        <div ref={panelRef} className="scroll-mt-20 border-t border-border px-5 py-5">
          <RunPanel run={run} onRetry={start} />
        </div>
      )}
    </Card>
  )
}

/* ------------------------------------------------------------------ page */

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading conversation">
      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-7 w-80 max-w-full" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px] xl:items-start">
        <div className="flex flex-col gap-6 xl:col-start-2 xl:row-start-1">
          <div className="rounded-lg border border-border bg-surface p-5">
            <Skeleton className="h-4 w-24" />
            <SkeletonText lines={2} className="mt-3" />
            <Skeleton className="mt-5 h-8 w-full" />
            <Skeleton className="mt-3 h-8 w-full" />
          </div>
          <div className="rounded-lg border border-border bg-surface p-5">
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-44" />
              </div>
            </div>
            <SkeletonText lines={4} className="mt-5" />
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-5 xl:col-start-1 xl:row-start-1">
          <Skeleton className="h-4 w-20" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="mt-5 rounded-lg border border-border p-4">
              <div className="flex items-center gap-2">
                <Skeleton className="size-5 rounded-full" />
                <Skeleton className="h-3 w-32" />
              </div>
              <SkeletonText lines={3} className="mt-4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ConversationView({ id }: { id: string }) {
  const { data: conversation, isPending, isError, error, refetch } = useConversation(id)
  const [replying, setReplying] = useState(false)
  usePageTitle(conversation?.contact.name)

  if (isPending) return <DetailSkeleton />

  if (!conversation) {
    if (error instanceof ApiError && error.status === 404) {
      return (
        <PageHeader
          eyebrow={backLink}
          title="Conversation not found"
          description="There is no conversation at this address. It may have been removed when the demo data was reset."
          actions={
            <Link to="/app/conversations" className={buttonVariants({ variant: 'primary' })}>
              <MessagesSquare aria-hidden />
              See all conversations
            </Link>
          }
        />
      )
    }
    return (
      <>
        <PageHeader eyebrow={backLink} title="Conversation" />
        <InlineError className="mt-6" error={error} title="Could not load this conversation" onRetry={() => void refetch()} />
      </>
    )
  }

  return (
    <>
      <PageHeader
        eyebrow={backLink}
        title={conversation.subject}
        meta={
          <>
            <ConversationStatusBadge conversation={conversation} />
            <ContactTypeBadge type={conversation.contact.type} />
          </>
        }
        description={conversationHeadline(conversation)}
      />

      {isError ? (
        <InlineError className="mt-6" error={error} title="Could not refresh this conversation" onRetry={() => void refetch()} />
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px] xl:items-start">
        <div className="flex min-w-0 flex-col gap-6 xl:col-start-2 xl:row-start-1">
          <AssistantCard conversation={conversation} />
          <ContactPanel conversation={conversation} />
        </div>
        <div className="flex min-w-0 flex-col gap-6 xl:col-start-1 xl:row-start-1">
          <MessageThread conversation={conversation} onSimulateReply={() => setReplying(true)} />
          <ConversationActivity threadId={conversation.id} activity={conversation.activity} />
        </div>
      </div>

      <SimulateReplyDialog conversation={conversation} open={replying} onOpenChange={setReplying} />
    </>
  )
}

/** One conversation: the thread, the contact and strategy, the live assistant run, and its activity. */
export default function ConversationDetail() {
  const { id = '' } = useParams()
  // Keyed by id so a run, dialog or expanded list never carries over to another conversation.
  return <ConversationView key={id} id={id} />
}
