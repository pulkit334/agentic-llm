import { ArrowRight, LogIn, Menu } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Wordmark } from '@/components/brand'
import { ThemeToggle } from '@/components/theme-toggle'
import { buttonVariants } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { NAV_SECTIONS, focusSection, useLandingCta } from './content'
import { SectionLink } from './section'

const navLinkClass =
  'inline-flex h-8 items-center rounded-md px-2.5 text-sm font-medium text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-foreground'

/** Sticky public header: wordmark, section links, theme, and sign-in / get-started (or "Open the app"). */
export function SiteHeader() {
  const cta = useLandingCta()
  const navigate = useNavigate()

  const goToSection = (id: string) => {
    navigate(`#${id}`)
    focusSection(id)
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link to="/" aria-label="Followup home" className="rounded-sm">
          <Wordmark />
        </Link>

        <nav aria-label="Sections" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {NAV_SECTIONS.map((s) => (
              <li key={s.id}>
                <SectionLink section={s.id} className={navLinkClass}>
                  {s.label}
                </SectionLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <ThemeToggle className="hidden sm:inline-flex" />
          {cta.signedIn ? (
            <Link to={cta.primary.to} className={buttonVariants({ variant: 'primary', size: 'sm' })}>
              {cta.primary.label}
              <ArrowRight aria-hidden />
            </Link>
          ) : (
            <>
              <Link to="/signin" className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'hidden text-foreground sm:inline-flex' })}>
                Sign in
              </Link>
              <Link to="/signup" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
                Get started
              </Link>
            </>
          )}

          <div className="md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger aria-label="Open menu" className={buttonVariants({ variant: 'ghost', size: 'icon', className: '-mr-1.5' })}>
                <Menu aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                {NAV_SECTIONS.map((s) => (
                  <DropdownMenuItem key={s.id} onSelect={() => goToSection(s.id)}>
                    {s.label}
                  </DropdownMenuItem>
                ))}
                {cta.signedIn ? null : (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem icon={<LogIn aria-hidden />} onSelect={() => navigate('/signin')}>
                      Sign in
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  )
}
