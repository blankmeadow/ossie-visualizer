import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
} from '@xyflow/react'
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
  const elkRoute = data?.routeMode === 'elk-orthogonal'
  const staticElkRoute = elkRoute && bends.length >= 2
  const acrossFlow = VERTICAL_SIDES.includes(sourcePosition)
    ? Math.abs(targetX - sourceX)
    : Math.abs(targetY - sourceY)

  const routePoints = staticElkRoute
    ? bends
    : [{ x: sourceX, y: sourceY }, ...bends, { x: targetX, y: targetY }]
  let drawn
  if (staticElkRoute) {
    drawn = elkOrthogonalPath(routePoints, fraction)
  } else if (elkRoute) {
    // Dragging invalidates ELK's absolute bend coordinates. Rebuild a hard
    // orthogonal route from React Flow's live handles instead of falling back
    // to the Bezier path used by Dagre/unrouted relationship edges.
    drawn = getSmoothStepPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
      borderRadius: 0,
      offset: 32,
    })
  } else if (bends.length) {
    // The engine routed this edge from and to the same handles React Flow is
    // reporting, so its bends drop straight in between them.
    drawn = bentPath(routePoints, fraction)
  } else if (acrossFlow <= STRAIGHT_TOLERANCE) {
    drawn = getStraightPath({ sourceX, sourceY, targetX, targetY })
  } else {
    drawn = getBezierPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
      curvature: 0.18,
    })
  }
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
  // A route the engine laid out comes with the spot it kept clear for the name,
  // which is the one place on the canvas known to be free of cards and of other
  // names. Only an edge nothing routed falls back to a point along its line.
  const placed = staticElkRoute ? data?.labelPoint : null
  const labelTransform = placed
    ? `translate(${placed.x}px, ${placed.y}px) translate(-50%, -50%)`
    : isVertical
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
            // A name too long for the room the layout kept clear is clipped, so
            // the whole one has to be readable some other way.
            title={label}
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
