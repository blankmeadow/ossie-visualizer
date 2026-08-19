import { clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * tailwind-merge resolves conflicts using a built-in map of Tailwind's default
 * class groups. The type scale in styles/tokens.css adds size steps that map
 * does not know about, and an unknown `text-*` class is assumed to be a text
 * *colour* — so `cn('text-micro', 'text-[#8b9691]')` silently dropped the size.
 * Registering the custom steps keeps size and colour in separate conflict
 * groups. Any further `--text-*` token added to tokens.css belongs here too.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['micro', 'tiny', 'md'] }],
    },
  },
})

/** Merge class names, letting later Tailwind utilities win over earlier ones. */
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
