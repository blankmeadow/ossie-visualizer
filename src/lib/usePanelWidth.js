import { useCallback, useEffect, useState } from 'react'

/**
 * A workspace panel the reader can widen, remembered between visits.
 *
 * The width lives in React rather than on the element so that everything that
 * has to agree with it -- the grid column, the minimap offset, the maths that
 * frames the graph clear of the inspector -- can read one number.
 */
export const PANEL_WIDTHS = {
  sidebar: { min: 200, max: 520, initial: 224 },
  inspector: { min: 340, max: 760, initial: 420 },
}

function clamp(value, { min, max }) {
  return Math.min(max, Math.max(min, Math.round(value)))
}

function storageKey(name) {
  return `ossie-visualizer:${name}-width`
}

function storedWidth(name, limits) {
  try {
    const value = Number(window.localStorage.getItem(storageKey(name)))
    return Number.isFinite(value) && value > 0 ? clamp(value, limits) : 0
  } catch {
    return 0
  }
}

export function usePanelWidth(name) {
  const limits = PANEL_WIDTHS[name]
  const [width, setWidth] = useState(() => storedWidth(name, limits) || limits.initial)

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey(name), String(width))
    } catch {
      // A blocked storage quota must not take the layout down.
    }
  }, [name, width])

  const resize = useCallback(
    (delta) => setWidth((current) => clamp(current + delta, limits)),
    [limits],
  )
  const reset = useCallback(() => setWidth(limits.initial), [limits])

  return { width, resize, reset }
}
