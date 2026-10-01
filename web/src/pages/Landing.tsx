import { useDocumentTitle } from '@/components/layout/page-title'
import { SkipLink } from '@/components/skip-link'
import { ClosingCta } from './landing/ClosingCta'
import { useSmoothScroll } from './landing/content'
import { Hero } from './landing/Hero'
import { HowItWorksSection } from './landing/HowItWorksSection'
import { SafeguardsSection } from './landing/SafeguardsSection'
import { SiteFooter } from './landing/SiteFooter'
import { SiteHeader } from './landing/SiteHeader'
import { StrategiesSection } from './landing/StrategiesSection'
import { UnderTheHoodSection } from './landing/UnderTheHoodSection'

/**
 * Public landing page: what Followup does, how the agent plans and acts, the safeguards it
 * enforces, the per-recipient strategies and what it is built on.
 */
export default function Landing() {
  useDocumentTitle(null)
  useSmoothScroll()

  return (
    <div className="min-h-dvh bg-background">
      <SkipLink />
      <SiteHeader />
      <main id="main" tabIndex={-1} className="outline-none">
        <Hero />
        <HowItWorksSection />
        <SafeguardsSection />
        <StrategiesSection />
        <UnderTheHoodSection />
        <ClosingCta />
      </main>
      <SiteFooter />
    </div>
  )
}
