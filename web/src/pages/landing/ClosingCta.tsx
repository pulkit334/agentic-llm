import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { buttonVariants } from '@/components/ui/button'
import { useLandingCta } from './content'

/** Last call to action: how to see the whole workflow in the demo. */
export function ClosingCta() {
  const cta = useLandingCta()
  return (
    <section aria-labelledby="try-it-title" className="border-t border-border">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-16 sm:px-6 sm:py-24 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <h2 id="try-it-title" className="text-2xl font-semibold tracking-[-0.03em] text-foreground">
            Run it end to end.
          </h2>
          <p className="mt-3 text-lg text-muted">
            Let the assistant handle the sample conversation, then move the demo clock forward and watch the follow-up go out. Or simulate a reply
            first and watch it get cancelled.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-3">
          <Link to={cta.primary.to} className={buttonVariants({ variant: 'primary', size: 'lg' })}>
            {cta.primary.label}
            <ArrowRight aria-hidden />
          </Link>
          <Link to={cta.secondary.to} className={buttonVariants({ variant: 'secondary', size: 'lg' })}>
            {cta.secondary.label}
          </Link>
        </div>
      </div>
    </section>
  )
}
