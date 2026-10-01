import { CalendarClock } from 'lucide-react'
import { Code } from '@/components/ui/code'
import { SECTIONS } from './content'
import { Section } from './section'

interface Step {
  title: string
  description: string
  /** Tool names from followup/tools.py used in this step. */
  tools: string[]
}

const STEPS: Step[] = [
  {
    title: 'Give it a conversation',
    description:
      'Paste an email thread or pick one that is already saved. It stores the contact, the messages and the recipient type: customer, student, employee or business contact.',
    tools: ['save_conversation', 'get_contact'],
  },
  {
    title: 'It checks what already happened',
    description:
      'Every earlier message and follow-up to this person, who wrote last, and whether something is already queued. Nothing is decided from the last email alone.',
    tools: ['get_thread_history', 'list_followups'],
  },
  {
    title: 'It decides, times and drafts',
    description:
      'Follow up, answer their question, close the thread or do nothing. The recipient’s strategy sets the wait, the tone and the length of the draft.',
    tools: ['lookup_faq', 'get_strategy'],
  },
  {
    title: 'It acts and records',
    description:
      'Schedules the follow-up or sends a reply through the email tool once the safeguards approve, then writes the decision and its reasons to the audit log.',
    tools: ['schedule_followup', 'send_email_now', 'record_decision'],
  },
]

/** The four-step loop, with the tools each step uses. */
export function HowItWorksSection() {
  const { id, label } = SECTIONS.howItWorks
  return (
    <Section
      id={id}
      eyebrow={label}
      title="One loop: read, check, decide, act."
      description="The assistant plans its own steps and calls tools to carry them out. The same steps run whether Claude or the built-in rules are in charge."
    >
      <ol className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, index) => (
          <li key={step.title} className="border-t border-border-strong pt-5">
            <p className="font-mono text-xs text-subtle tabular-nums">{String(index + 1).padStart(2, '0')}</p>
            <h3 className="mt-3 text-lg font-medium text-foreground">{step.title}</h3>
            <p className="mt-2 text-base text-muted">{step.description}</p>
            <ul aria-label="Tools used" className="mt-4 flex flex-wrap gap-1.5">
              {step.tools.map((tool) => (
                <li key={tool}>
                  <Code>{tool}</Code>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      <div className="mt-12 flex gap-3 rounded-lg border border-border bg-surface px-4 py-4 sm:px-5">
        <CalendarClock aria-hidden className="mt-[3px] size-4 shrink-0 text-muted" />
        <p className="text-base text-muted">
          <span className="font-medium text-foreground">Then the scheduler takes over.</span> When a follow-up falls due it checks the conversation once
          more. If they replied, opted out or the thread was closed in the meantime, the follow-up is cancelled instead of sent.
        </p>
      </div>
    </Section>
  )
}
