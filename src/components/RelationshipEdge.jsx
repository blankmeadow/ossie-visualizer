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
  selected,
}) {
  const t = useT()
  const { zoom } = useViewport()
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })
  const towardLabelX = labelX - targetX
  const towardLabelY = labelY - targetY
  const towardLabelLength = Math.max(1, Math.hypot(towardLabelX, towardLabelY))
  const count = data?.relationPaths?.length || 1
  const title = data?.selection?.name || data?.label || t('canvas.edgeFallback')
  const mapping = data?.kind === 'mapping'
  const actionDistance = mapping ? 54 : 30
  const actionX = targetX + (towardLabelX / towardLabelLength) * actionDistance
  const actionY = targetY + (towardLabelY / towardLabelLength) * actionDistance

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={style}
        interactionWidth={interactionWidth}
      />
      <EdgeLabelRenderer>
        {data?.showAnchor && (
          <button
            type="button"
            className={`edge-action ${mapping ? 'edge-action--mapping' : ''} nodrag nopan ${selected ? 'is-selected' : ''}`}
            style={{ transform: `translate(-50%, -50%) translate(${actionX}px, ${actionY}px) scale(${1 / zoom})` }}
            aria-label={`${mapping ? t('canvas.viewMapping') : t('canvas.viewRelationship')} ${title}`}
            title={title}
            onClick={(event) => {
              event.stopPropagation()
              data?.onSelect?.(data.selection)
            }}
          >
            {mapping ? '↗' : count > 1 ? count : '·'}
          </button>
        )}
        {label && (
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
        )}
      </EdgeLabelRenderer>
    </>
  )
}
