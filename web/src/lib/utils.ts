import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * tailwind-merge needs to know about the custom type scale in index.css, otherwise it
 * treats `text-sm` (a size) and `text-muted` (a colour) as the same group and drops one.
 */
const twMerge = extendTailwindMerge({
  override: {
    theme: {
      text: ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl'],
      radius: ['sm', 'md', 'lg'],
      shadow: ['popover', 'dialog'],
    },
  },
})

/** Merge class names; later Tailwind classes win over earlier conflicting ones. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
