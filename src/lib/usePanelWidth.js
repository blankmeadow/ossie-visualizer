import { useCallback, useEffect, useState } from 'react'

/**
 * A workspace panel the reader can widen or fold away, remembered between
 * visits.
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

function collapsedKey(name) {
  return `ossie-visualizer:${name}-collapsed`
}

function storedCollapsed(name) {
  try {
    return window.localStorage.getItem(collapsedKey(name)) === '1'
  } catch {
    return false
  }
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
  const [collapsed, setCollapsed] = useState(() => storedCollapsed(name))

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey(name), String(width))
      window.localStorage.setItem(collapsedKey(name), collapsed ? '1' : '0')
    } catch {
      // A blocked storage quota must not take the layout down.
    }
  }, [collapsed, name, width])

  const resize = useCallback(
    (delta) => setWidth((current) => clamp(current + delta, limits)),
    [limits],
  )
  const reset = useCallback(() => setWidth(limits.initial), [limits])
  const toggle = useCallback(() => setCollapsed((current) => !current), [])

  return { width, resize, reset, collapsed, toggle }
}
