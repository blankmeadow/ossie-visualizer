import { BaseEdge, EdgeLabelRenderer, getBezierPath, getStraightPath } from '@xyflow/react'
import { elkOrthogonalPath, pointAlongPath, pointDistance, stepAlong } from '../lib/edgePath'

// Within this much sideways drift a curve is just a wobble, so the edge is
// drawn as the straight line it almost is.
const STRAIGHT_TOLERANCE = 26
// How much of each bend is rounded off, capped by the shortest leg meeting it.
const CORNER_RADIUS = 18

const VERTICAL_SIDES = ['top', 'bottom']

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
      pointDistance(points[index - 1], corner) / 2,
      pointDistance(corner, points[index + 1]) / 2,
    )
    const enter = stepAlong(corner, points[index - 1], radius)
    const leave = stepAlong(corner, points[index + 1], radius)
    path += ` L ${enter.x},${enter.y} Q ${corner.x},${corner.y} ${leave.x},${leave.y}`
  }
  const last = points[points.length - 1]
  path += ` L ${last.x},${last.y}`

  const [labelX, labelY] = pointAlongPath(points, fraction)
  return [path, labelX, labelY]
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
  const fraction = data?.labelFraction ?? 0.5
  const elkRoute = data?.routeMode === 'elk-orthogonal' && bends.length >= 2
  const acrossFlow = VERTICAL_SIDES.includes(sourcePosition)
    ? Math.abs(targetX - sourceX)
    : Math.abs(targetY - sourceY)

  const routePoints = elkRoute
    ? bends
    : [{ x: sourceX, y: sourceY }, ...bends, { x: targetX, y: targetY }]
  const drawn = elkRoute
    ? elkOrthogonalPath(routePoints, fraction)
    : bends.length
    // The engine routed this edge from and to the same handles React Flow is
    // reporting, so its bends drop straight in between them.
      ? bentPath(routePoints, fraction)
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
  // An edge sharing its pair of cards with another one is told where along
  // itself to put its label. On a plain curve the point on the chord is close
  // enough to the line to read as sitting on it.
  const [path, labelX, labelY] = bends.length || fraction === 0.5
    ? drawn
    : [drawn[0], sourceX + (targetX - sourceX) * fraction, sourceY + (targetY - sourceY) * fraction]

  // Keep labels readable like n8n: horizontal edges place the label above the
  // line; vertical edges place it beside the line instead of rotating text.
  // Two edges joining the same pair of cards are told to take opposite sides.
  const isVertical = Math.abs(targetY - sourceY) > Math.abs(targetX - sourceX)
  const side = data?.labelSide || 0
  const labelTransform = isVertical
    ? `translate(${labelX}px, ${labelY}px) translate(${side > 0 ? 'calc(-100% - 12px)' : '12px'}, -50%)`
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
