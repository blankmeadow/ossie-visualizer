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
    curvature: 0.18,
  })

  // Keep labels readable like n8n: horizontal edges place the label above the
  // line; vertical edges place it beside the line instead of rotating text.
  const isVertical = Math.abs(targetY - sourceY) > Math.abs(targetX - sourceX)
  const labelTransform = isVertical
    ? `translate(${labelX}px, ${labelY}px) translate(12px, -50%)`
    : `translate(${labelX}px, ${labelY}px) translate(-50%, calc(-100% - 5px))`

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
