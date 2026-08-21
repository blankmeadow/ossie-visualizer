import { BaseEdge, EdgeLabelRenderer, getBezierPath, getStraightPath } from '@xyflow/react'

// Within this much sideways drift a curve is just a wobble, so the edge is
// drawn as the straight line it almost is.
const STRAIGHT_TOLERANCE = 26
// How much of each bend is rounded off, capped by the shortest leg meeting it.
const CORNER_RADIUS = 18

const VERTICAL_SIDES = ['top', 'bottom']

function distance(from, to) {
  return Math.hypot(to.x - from.x, to.y - from.y)
}

/** The point `length` along the way from `from` to `to`. */
function step(from, to, length) {
  const span = distance(from, to) || 1
  const ratio = Math.min(1, length / span)
  return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio }
}

/** The point `fraction` of the way along a quadratic curve. */
function quadraticPoint(from, control, to, fraction) {
  const rest = 1 - fraction
  return {
    x: rest * rest * from.x + 2 * rest * fraction * control.x + fraction * fraction * to.x,
    y: rest * rest * from.y + 2 * rest * fraction * control.y + fraction * fraction * to.y,
  }
}

/**
 * A polyline with its corners rounded off, and the point `fraction` along it.
 *
 * The bends come from the layout, which knows where the other cards are; the
 * rounding is what keeps a detour from reading as a hard mechanical turn.
 */
function bentPath(points, fraction = 0.5) {
  let path = `M ${points[0].x},${points[0].y}`
  for (let index = 1; index < points.length - 1; index++) {
    const corner = points[index]
    const radius = Math.min(
      CORNER_RADIUS,
      distance(points[index - 1], corner) / 2,
      distance(corner, points[index + 1]) / 2,
    )
    const enter = step(corner, points[index - 1], radius)
    const leave = step(corner, points[index + 1], radius)
    path += ` L ${enter.x},${enter.y} Q ${corner.x},${corner.y} ${leave.x},${leave.y}`
  }
  const last = points[points.length - 1]
  path += ` L ${last.x},${last.y}`

  const lengths = points.slice(1).map((point, index) => distance(points[index], point))
  const mark = lengths.reduce((total, value) => total + value, 0) * fraction
  let walked = 0
  for (let index = 0; index < lengths.length; index++) {
    if (walked + lengths[index] >= mark) {
      const anchor = step(points[index], points[index + 1], mark - walked)
      return [path, anchor.x, anchor.y]
    }
    walked += lengths[index]
  }
  return [path, last.x, last.y]
}

export default function RelationshipEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  interactionWidth,
  data,
  label,
  selected,
}) {
  const bends = data?.points || []
  const bow = data?.bow
  const fraction = data?.labelFraction ?? 0.5
  const acrossFlow = VERTICAL_SIDES.includes(sourcePosition)
    ? Math.abs(targetX - sourceX)
    : Math.abs(targetY - sourceY)

  const [path, labelX, labelY] = bends.length
    // The bends are laid out for the handles this edge left the layout with, so
    // they join the ends React Flow reports rather than replacing them.
    ? bentPath([{ x: sourceX, y: sourceY }, ...bends, { x: targetX, y: targetY }], fraction)
    : bow
      // One arc per edge running between the same two cards.
      ? [
        `M ${sourceX},${sourceY} Q ${bow.x},${bow.y} ${targetX},${targetY}`,
        quadraticPoint({ x: sourceX, y: sourceY }, bow, { x: targetX, y: targetY }, fraction).x,
        quadraticPoint({ x: sourceX, y: sourceY }, bow, { x: targetX, y: targetY }, fraction).y,
      ]
      : acrossFlow <= STRAIGHT_TOLERANCE
        ? getStraightPath({ sourceX, sourceY, targetX, targetY })
        : getBezierPath({
          sourceX,
          sourceY,
          targetX,
          targetY,
          sourcePosition,
          targetPosition,
          curvature: 0.18,
        })

  // Keep labels readable like n8n: horizontal edges place the label above the
  // line; vertical edges place it beside the line instead of rotating text.
  // An edge bowed aside from its twin takes its label to the side it bowed to,
  // which is what actually keeps two long relationship names apart on a short
  // run between the same two cards.
  const isVertical = Math.abs(targetY - sourceY) > Math.abs(targetX - sourceX)
  const side = data?.labelSide || 0
  const labelTransform = isVertical
    ? `translate(${labelX}px, ${labelY}px) translate(${side < 0 ? 'calc(-100% - 12px)' : '12px'}, -50%)`
    : `translate(${labelX}px, ${labelY}px) translate(-50%, ${side > 0 ? '5px' : 'calc(-100% - 5px)'})`

  const activeStyle = selected ? {
    ...style,
    stroke: '#4f8f75',
    strokeWidth: 1.55,
  } : style

  const showLabel = data?.showEdgeLabels !== false && !!label

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={activeStyle}
        interactionWidth={interactionWidth}
      />
      {showLabel && (
        <EdgeLabelRenderer>
          <button
            type="button"
            className={`edge-label-text nodrag nopan ${isVertical ? 'is-vertical' : ''} ${selected ? 'is-active' : ''} ${data?.dimmed ? 'is-dimmed' : ''}`}
            style={{
              transform: labelTransform,
            }}
            onClick={(event) => {
              event.stopPropagation()
              data?.onSelect?.(data.selection)
            }}
            onDoubleClick={(event) => {
              event.stopPropagation()
              data?.onOpenDetail?.(data.selection)
            }}
          >
            {label}
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
