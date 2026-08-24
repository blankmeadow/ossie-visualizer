// The layout engines, React Flow handle bounds, and rendered node shell all
// share this fixed geometry. Keeping it in a dependency-free module prevents a
// component that only needs dimensions from pulling Dagre into its module tree.
export const NODE_WIDTH = 224
export const NODE_HEIGHT = 72
export const HANDLE_SIZE = 10
export const HANDLE_OUTSET = HANDLE_SIZE / 2

/**
 * Describe a rendered handle directly to React Flow.
 *
 * x/y are the handle's top-left corner relative to the node. Handles straddle
 * the card border, so getHandlePosition resolves their outer rim to the same
 * five-pixel-outset anchor used by strict ELK routes.
 */
export function declarativeHandle(handle, type) {
  const along = handle.position === 'top' || handle.position === 'bottom'
    ? (NODE_WIDTH * handle.offset) / 100 - HANDLE_OUTSET
    : (NODE_HEIGHT * handle.offset) / 100 - HANDLE_OUTSET
  const x = handle.position === 'left'
    ? -HANDLE_OUTSET
    : handle.position === 'right'
      ? NODE_WIDTH - HANDLE_OUTSET
      : along
  const y = handle.position === 'top'
    ? -HANDLE_OUTSET
    : handle.position === 'bottom'
      ? NODE_HEIGHT - HANDLE_OUTSET
      : along
  return {
    id: handle.id,
    type,
    position: handle.position,
    x,
    y,
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
  }
}
