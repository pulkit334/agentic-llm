import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useDocumentTitle } from '@/components/layout/page-title'
import { Alert, Button, Field, Input, buttonVariants } from '@/components/ui'
import { errorMessage } from '@/lib/api'
import { useAuth, type AuthRedirectState } from '@/lib/auth'
import { useAuthStatus } from '@/lib/queries'
import { AuthShell } from './auth/AuthShell'
import { PasswordInput } from './auth/PasswordInput'
import { authLinkClass, clearSessionData, emailError } from './auth/auth-form'

/**
 * /signin. On success AuthProvider stores the user and GuestOnly sends them on to where they
 * were going (or /app); this page only collects and checks the credentials.
 */
export default function SignIn() {
  useDocumentTitle('Sign in')
  const { signIn } = useAuth()
  const client = useQueryClient()
  const location = useLocation()
  const redirectState = location.state as AuthRedirectState | null
  const authStatus = useAuthStatus()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  const login = useMutation({
    mutationFn: async (vars: { email: string; password: string }) => {
      clearSessionData(client)
      return signIn(vars.email, vars.password)
    },
  })

  const errors = submitted
    ? { email: emailError(email), password: password ? undefined : 'Enter your password.' }
    : { email: undefined, password: undefined }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (login.isPending) return
    setSubmitted(true)
    if (emailError(email)) {
      emailRef.current?.focus()
      return
    }
    if (!password) {
      passwordRef.current?.focus()
      return
    }
    login.mutate(
      { email: email.trim(), password },
      {
        onError: () => {
          // Keep the email; put the cursor back in the password so it can be retyped.
          passwordRef.current?.focus()
          passwordRef.current?.select()
        },
      },
    )
  }

  const noAccounts = authStatus.data?.has_users === false

  return (
    <AuthShell
      title="Sign in to Followup"
      description="See what the assistant scheduled, sent and skipped, and run it on new conversations."
      notice={
        noAccounts ? (
          <Alert
            title="No accounts yet"
            action={
              <Link to="/signup" state={redirectState} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                Create account
              </Link>
            }
          >
            The first account you create becomes the admin.
          </Alert>
        ) : null
      }
      footer={
        noAccounts ? null : (
          <>
            New to Followup?{' '}
            <Link to="/signup" state={redirectState} className={authLinkClass}>
              Create an account
            </Link>
          </>
        )
      }
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4" aria-label="Sign in">
        {login.isError ? (
          <Alert tone="danger" assertive>
            {errorMessage(login.error)}
          </Alert>
        ) : null}

        <Field label="Email" error={errors.email}>
          <Input
            ref={emailRef}
            type="email"
            name="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            maxLength={255}
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field label="Password" error={errors.password}>
          <PasswordInput
            ref={passwordRef}
            name="password"
            autoComplete="current-password"
            maxLength={1024}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        <Button type="submit" variant="primary" size="lg" className="mt-2 w-full" loading={login.isPending}>
          Sign in
        </Button>
      </form>
    </AuthShell>
  )
}
