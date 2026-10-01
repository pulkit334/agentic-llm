/**
 * Move keyboard focus to a section after an in-page link scrolls to it, so the next Tab
 * continues from there. The target needs `tabIndex={-1}`. The scroll itself is done by
 * React Router's ScrollRestoration (src/router.tsx), which scrolls to the URL hash.
 */
export function focusSection(id: string) {
  requestAnimationFrame(() => document.getElementById(id)?.focus({ preventScroll: true }))
}
