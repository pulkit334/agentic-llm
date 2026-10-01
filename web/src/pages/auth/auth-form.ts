/**
 * Sign-in / sign-up helpers: client-side checks that mirror followup/auth.py, so people see the
 * same rules before the request goes out. (The auth-status query is `useAuthStatus` in lib/queries.)
 */
import type { QueryClient } from '@tanstack/react-query'

/** Same pattern as auth.EMAIL_RE on the backend. */
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** auth.MIN_PASSWORD_LEN */
export const MIN_PASSWORD_LENGTH = 8

export const PASSWORD_HINT = `At least ${MIN_PASSWORD_LENGTH} characters, mixing letters with numbers or symbols.`

export function emailError(email: string): string | undefined {
  const value = email.trim()
  if (!value) return 'Enter your email address.'
  if (!EMAIL_PATTERN.test(value)) return 'Enter a valid email address, like name@company.com.'
  return undefined
}

export function nameError(name: string): string | undefined {
  return name.trim() ? undefined : 'Enter your name.'
}

/** auth.validate_password: 8+ characters, not only letters and not only digits. */
export function newPasswordError(password: string): string | undefined {
  if (!password) return 'Choose a password.'
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`
  if (/^\p{L}+$/u.test(password) || /^\p{Nd}+$/u.test(password)) return 'Mix letters with numbers or symbols.'
  return undefined
}

export type SignUpField = 'name' | 'email' | 'password'

/**
 * Which field a sign-up error from the server belongs to ("An account with this email already
 * exists." -> email), or null when it is about the form as a whole.
 */
export function signUpFieldFor(message: string): SignUpField | null {
  if (/password/i.test(message)) return 'password'
  if (/email/i.test(message)) return 'email'
  if (/\bname\b/i.test(message)) return 'name'
  return null
}

/**
 * Drop cached app data left over from an earlier session (for example one that expired), so
 * the new session starts from fresh requests instead of showing someone else's last view.
 * Called right before signing in, while no app page is mounted.
 */
export function clearSessionData(client: QueryClient) {
  client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' })
}

/** Inline text link in the auth pages ("Create an account", "Sign in"). */
export const authLinkClass =
  'rounded-sm font-medium text-foreground underline decoration-border-strong underline-offset-4 transition-colors duration-150 hover:decoration-foreground'
