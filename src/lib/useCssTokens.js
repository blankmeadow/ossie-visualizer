import { useEffect, useState } from 'react'

/**
 * Read design tokens out of CSS custom properties so they can be handed to
 * libraries that take colours as props rather than as styles.
 *
 * React Flow's Background/MiniMap paint into SVG attributes, where `var(--x)`
 * does not resolve, so the values have to be read here instead of hardcoded at
 * the call site. Re-reads when the colour scheme changes or when a theme
 * attribute is swapped on <html>, so the canvas follows the rest of the UI.
 *
 * @param {Record<string, string>} fallbacks token name -> value used until the
 *   stylesheet has applied (Vite injects styles asynchronously in dev).
 */
export function useCssTokens(fallbacks) {
  const readTokens = () => {
    if (typeof window === 'undefined') return fallbacks
    const styles = getComputedStyle(document.documentElement)
    const entries = Object.entries(fallbacks).map(([name, fallback]) => {
      const value = styles.getPropertyValue(`--${name}`).trim()
      return [name, value || fallback]
    })
    return Object.fromEntries(entries)
  }

  const [tokens, setTokens] = useState(readTokens)

  useEffect(() => {
    const update = () => setTokens(readTokens())
    update()

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', update)
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    })
    return () => {
      media.removeEventListener('change', update)
      observer.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Object.keys(fallbacks).join(',')])

  return tokens
}
