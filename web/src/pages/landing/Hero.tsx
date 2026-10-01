import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { buttonVariants } from '@/components/ui/button'
import { PROJECT } from '@/lib/product'
import { SECTIONS, useLandingCta } from './content'
import { ProductPreview } from './ProductPreview'
import { SectionLink } from './section'

/** Headline, one-paragraph explanation, calls to action, and the product preview. */
export function Hero() {
  const cta = useLandingCta()

  return (
    <section aria-labelledby="hero-title">
      <div className="mx-auto w-full max-w-6xl px-4 pt-16 pb-12 sm:px-6 sm:pt-24 sm:pb-16">
        <p className="inline-flex h-7 items-center gap-2 rounded-md border border-border px-2.5 text-xs text-muted">
          <span className="font-mono text-foreground">{PROJECT.problem}</span>
          <span aria-hidden className="h-3 w-px bg-border-strong" />
          <span>
            {PROJECT.event} · Team {PROJECT.team}
          </span>
        </p>

        <h1 id="hero-title" className="mt-6 max-w-4xl text-3xl font-semibold tracking-[-0.04em] text-foreground md:text-4xl lg:text-5xl">
          Follow-ups that never slip <br aria-hidden className="hidden md:inline" />
          <span className="text-muted">– and never double up.</span>
        </h1>

        <p className="mt-6 max-w-2xl text-lg text-muted sm:text-xl">
          Give it an email thread. Followup checks what was already said, decides whether a follow-up is needed, picks a time inside the
          recipient’s business hours, drafts the message and schedules it. Every step is recorded.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link to={cta.primary.to} className={buttonVariants({ variant: 'primary', size: 'lg' })}>
            {cta.primary.label}
            <ArrowRight aria-hidden />
          </Link>
          <SectionLink section={SECTIONS.howItWorks.id} className={buttonVariants({ variant: 'secondary', size: 'lg' })}>
            See how it works
          </SectionLink>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6 sm:pb-24">
        <ProductPreview />
      </div>
    </section>
  )
}
