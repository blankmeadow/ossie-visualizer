import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react'

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
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })

  // Calculate rotation angle of the edge text so it aligns with the edge path direction
  let angle = Math.atan2(targetY - sourceY, targetX - sourceX) * (180 / Math.PI)
  if (angle > 90 || angle < -90) {
    angle += 180
  }

  const activeStyle = selected ? {
    ...style,
    stroke: '#10b981',
    strokeWidth: 2.8,
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
            className={`edge-label-text nodrag nopan ${selected ? 'is-active' : ''} ${data?.dimmed ? 'is-dimmed' : ''}`}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px) rotate(${angle}deg)`,
            }}
            onClick={(event) => {
              event.stopPropagation()
              data?.onSelect?.(data.selection)
            }}
          >
            {label}
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
