import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useDocumentTitle } from '@/components/layout/page-title'
import { Alert, Button, Field, Input, toast } from '@/components/ui'
import { errorMessage } from '@/lib/api'
import { useAuth, type AuthRedirectState } from '@/lib/auth'
import { firstName } from '@/lib/format'
import { useAuthStatus } from '@/lib/queries'
import { AuthShell } from './auth/AuthShell'
import { PasswordInput } from './auth/PasswordInput'
import {
  PASSWORD_HINT,
  authLinkClass,
  clearSessionData,
  emailError,
  nameError,
  newPasswordError,
  signUpFieldFor,
  type SignUpField,
} from './auth/auth-form'

type Values = Record<SignUpField, string>
type Errors = Partial<Record<SignUpField, string>>

const FIELD_ORDER: SignUpField[] = ['name', 'email', 'password']

function validate(values: Values): Errors {
  return {
    name: nameError(values.name),
    email: emailError(values.email),
    password: newPasswordError(values.password),
  }
}

/**
 * /signup. The first account ever created becomes the admin, so the page says so when
 * GET /api/auth/status reports no accounts. On success GuestOnly redirects into the app.
 */
export default function SignUp() {
  useDocumentTitle('Create an account')
  const { signUp } = useAuth()
  const client = useQueryClient()
  const location = useLocation()
  const redirectState = location.state as AuthRedirectState | null
  const authStatus = useAuthStatus()

  const [values, setValues] = useState<Values>({ name: '', email: '', password: '' })
  const [submitted, setSubmitted] = useState(false)
  // Field errors returned by the server (e.g. email already taken); cleared when that field changes.
  const [serverErrors, setServerErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const focusField = (field: SignUpField) => {
    const ref = field === 'name' ? nameRef : field === 'email' ? emailRef : passwordRef
    ref.current?.focus()
  }

  const register = useMutation({
    mutationFn: async (vars: Values) => {
      clearSessionData(client)
      return signUp(vars.name, vars.email, vars.password)
    },
    // On the hook (not on mutate) so it still runs after GuestOnly has redirected away from this page.
    onSuccess: (user) => {
      toast.success(`Welcome, ${firstName(user.name)}`, user.role === 'admin' ? 'Your admin account is ready.' : 'Your account is ready.')
    },
  })

  const clientErrors = submitted ? validate(values) : {}
  const errors: Errors = {
    name: clientErrors.name ?? serverErrors.name,
    email: clientErrors.email ?? serverErrors.email,
    password: clientErrors.password ?? serverErrors.password,
  }

  const update = (field: SignUpField) => (event: { target: { value: string } }) => {
    const value = event.target.value
    setValues((v) => ({ ...v, [field]: value }))
    if (serverErrors[field]) setServerErrors((e) => ({ ...e, [field]: undefined }))
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (register.isPending) return
    setSubmitted(true)
    setFormError(null)
    setServerErrors({})

    const found = validate(values)
    const firstInvalid = FIELD_ORDER.find((field) => found[field])
    if (firstInvalid) {
      focusField(firstInvalid)
      return
    }

    register.mutate(
      { name: values.name.trim(), email: values.email.trim(), password: values.password },
      {
        onError: (error) => {
          const message = errorMessage(error)
          const field = signUpFieldFor(message)
          if (field) {
            setServerErrors({ [field]: message })
            focusField(field)
          } else {
            setFormError(message)
          }
        },
      },
    )
  }

  const isFirstAccount = authStatus.data?.has_users === false

  return (
    <AuthShell
      headingLoading={authStatus.isPending}
      title={isFirstAccount ? 'Create the first account' : 'Create your account'}
      description={
        isFirstAccount
          ? 'No one has signed up yet. Teammates who sign up after you join as members.'
          : 'Run the assistant on email threads, review its drafts and manage scheduled follow-ups.'
      }
      notice={
        isFirstAccount ? (
          <Alert icon={<ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />} title="This account becomes the admin">
            Admins can do everything members can, and can also reset the demo data.
          </Alert>
        ) : null
      }
      footer={
        isFirstAccount ? null : (
          <>
            Already have an account?{' '}
            <Link to="/signin" state={redirectState} className={authLinkClass}>
              Sign in
            </Link>
          </>
        )
      }
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4" aria-label="Create an account">
        {formError ? (
          <Alert tone="danger" assertive>
            {formError}
          </Alert>
        ) : null}

        <Field label="Name" error={errors.name}>
          <Input
            ref={nameRef}
            name="name"
            autoComplete="name"
            autoFocus
            maxLength={255}
            placeholder="Alex Sharma"
            value={values.name}
            onChange={update('name')}
          />
        </Field>

        <Field label="Email" error={errors.email}>
          <Input
            ref={emailRef}
            type="email"
            name="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={255}
            placeholder="you@company.com"
            value={values.email}
            onChange={update('email')}
          />
        </Field>

        <Field label="Password" hint={PASSWORD_HINT} error={errors.password}>
          <PasswordInput
            ref={passwordRef}
            name="password"
            autoComplete="new-password"
            maxLength={1024}
            value={values.password}
            onChange={update('password')}
          />
        </Field>

        <Button type="submit" variant="primary" size="lg" className="mt-2 w-full" loading={register.isPending}>
          {isFirstAccount ? 'Create admin account' : 'Create account'}
        </Button>
      </form>
    </AuthShell>
  )
}
