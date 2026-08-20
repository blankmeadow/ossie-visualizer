import { BaseEdge, EdgeLabelRenderer, getBezierPath, useViewport } from '@xyflow/react'
import { useT } from '../lib/i18n'

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
}) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={style}
        interactionWidth={interactionWidth}
      />
      {label && (
        <EdgeLabelRenderer>
          <button
            type="button"
            className="edge-label nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
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
