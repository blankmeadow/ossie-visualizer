import { useRef } from 'react'

/**
 * The grab strip between a panel and the canvas.
 *
 * Pointer capture keeps the drag alive once the cursor outruns the strip --
 * which it always does, because the strip is a few pixels wide. `direction`
 * is +1 when dragging right widens the panel (a left-hand panel) and -1 when
 * it narrows it (a right-hand panel).
 */
export default function ResizeHandle({ label, direction = 1, onResize, onReset }) {
  const lastX = useRef(null)

  const move = (clientX) => {
    if (lastX.current === null) return
    onResize((clientX - lastX.current) * direction)
    lastX.current = clientX
  }

  return (
    <div
      className="resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      tabIndex={0}
      onPointerDown={(event) => {
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        lastX.current = event.clientX
      }}
      onPointerMove={(event) => move(event.clientX)}
      onPointerUp={(event) => {
        event.currentTarget.releasePointerCapture(event.pointerId)
        lastX.current = null
      }}
      onPointerCancel={() => { lastX.current = null }}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        const step = (event.shiftKey ? 48 : 16) * (event.key === 'ArrowRight' ? 1 : -1)
        onResize(step * direction)
      }}
    />
  )
}
