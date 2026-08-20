import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react'
import OssieNode from './OssieNode'
import RelationshipEdge from './RelationshipEdge'
import { useT } from '../lib/i18n'
import { useCssTokens } from '../lib/useCssTokens'
import { NODE_HEIGHT, NODE_WIDTH } from '../lib/graph'

const nodeTypes = { ossieNode: OssieNode }
const edgeTypes = { relationshipEdge: RelationshipEdge }
// Framing maths has to agree with the dimensions dagre laid the graph out with.
const nodeWidth = NODE_WIDTH
const nodeHeight = NODE_HEIGHT
// Node cards sit above every edge layer; the highest an edge reaches is 8.
const NODE_LAYER = 10

// Fallbacks match the light-theme values in styles/tokens.css; the live values
// are read from CSS so the canvas follows the active theme.
const CANVAS_TOKENS = {
  'canvas-dots': '#ccd2cb',
  'canvas-minimap-mask': 'rgba(241, 243, 238, 0.78)',
  'node-concept': '#477d6b',
  'node-dataset': '#d16f3d',
  'node-metric': '#b98b22',
}

function selectionMatches(left, right) {
  return !!left && !!right && left.kind === right.kind && left.name === right.name
}

function edgeMatchesSelection(edge, selection) {
  if (!selection) return false
  if (selectionMatches(edge.data?.selection, selection)) return true
  return selection.kind === 'relationship' && edge.data?.relationPaths?.includes(selection.name)
}

function frameNodes(flow, canvasRef, items, inspectorWidth, duration = 340) {
  const canvas = canvasRef.current?.getBoundingClientRect()
  if (!canvas || !items.length) return false

  const minX = Math.min(...items.map((item) => item.position.x))
  const minY = Math.min(...items.map((item) => item.position.y))
  const maxX = Math.max(...items.map((item) => item.position.x + nodeWidth))
  const maxY = Math.max(...items.map((item) => item.position.y + nodeHeight))
  const boundsWidth = Math.max(nodeWidth, maxX - minX)
  const boundsHeight = Math.max(nodeHeight, maxY - minY)
  // Keep the framed graph clear of the inspector floating over the canvas.
  // The panel is resizable, so the reserve follows its real width, still
  // capped so a wide panel cannot squeeze the graph out of view entirely.
  const inspectorReserve = Math.min(inspectorWidth + 20, canvas.width * 0.5)
  const availableWidth = Math.max(260, canvas.width - inspectorReserve - 72)
  const availableHeight = Math.max(220, canvas.height - 96)
  const zoom = Math.max(0.1, Math.min(1.06, availableWidth / boundsWidth, availableHeight / boundsHeight))
  const contentCenterX = minX + boundsWidth / 2
  const contentCenterY = minY + boundsHeight / 2

  flow.setViewport({
    x: (canvas.width - inspectorReserve) / 2 - contentCenterX * zoom,
    y: canvas.height / 2 - contentCenterY * zoom,
    zoom,
  }, { duration })
  return true
}

function InnerGraphCanvas({ graph, selection, showMiniMap, onSelect, onFocus, canvasRef, inspectorWidth }) {
  const t = useT()
  const flow = useReactFlow()
  const tokens = useCssTokens(CANVAS_TOKENS)
  const previousGraphKey = useRef('')
  const previousCenteredNode = useRef('')
  const previousCenteredEdge = useRef('')
  const [hoveredEdgeId, setHoveredEdgeId] = useState('')

  const selectedNodeId = useMemo(
    () => graph.nodes.find((item) => selectionMatches(item.data?.selection, selection))?.id || '',
    [graph.nodes, selection],
  )
  const selectedEdgeIds = useMemo(
    () => new Set(graph.edges.filter((item) => edgeMatchesSelection(item, selection)).map((item) => item.id)),
    [graph.edges, selection],
  )

  const active = useMemo(() => {
    const nodeIds = new Set()
    const edgeIds = new Set()
    if (selectedNodeId) {
      nodeIds.add(selectedNodeId)
      for (const item of graph.edges) {
        if (item.source !== selectedNodeId && item.target !== selectedNodeId) continue
        edgeIds.add(item.id)
        nodeIds.add(item.source)
        nodeIds.add(item.target)
      }
    } else if (selectedEdgeIds.size) {
      for (const item of graph.edges) {
        if (!selectedEdgeIds.has(item.id)) continue
        edgeIds.add(item.id)
        nodeIds.add(item.source)
        nodeIds.add(item.target)
      }
    }
    return { nodeIds, edgeIds, enabled: nodeIds.size > 0 || edgeIds.size > 0 }
  }, [graph.edges, selectedEdgeIds, selectedNodeId])

  const nodes = useMemo(
    () => graph.nodes.map((item) => ({
      ...item,
      selected: item.id === selectedNodeId,
      // Above every edge. Edges carry an explicit z-index so the selected one
      // draws over its neighbours, and React Flow leaves nodes at 0, which put
      // every edge on top of every card: a line crossing a node hid part of it
      // and answered the click there with its own relationship.
      zIndex: NODE_LAYER,
      data: {
        ...item.data,
        dimmed: active.enabled && !active.nodeIds.has(item.id),
        related: active.enabled && active.nodeIds.has(item.id) && item.id !== selectedNodeId,
      },
    })),
    [active, graph.nodes, selectedNodeId],
  )

  const edges = useMemo(
    () => graph.edges.map((item) => {
      const selected = selectedEdgeIds.has(item.id)
      const related = active.enabled && active.edgeIds.has(item.id)
      const dimmed = active.enabled && !related
      const hovered = hoveredEdgeId === item.id
      // A bundled edge names its size instead of one of the relationships it
      // merges, and that wording follows the active language.
      const label = item.data?.bundleCount > 1
        ? t('canvas.bundleCount', { count: item.data.bundleCount })
        : item.data?.label
      return {
        ...item,
        selected,
        label: selected || hovered ? label : undefined,
        data: {
          ...item.data,
          showAnchor: item.data?.kind === 'mapping'
            || (item.data?.kind === 'relationship' && graph.nodes.length <= 24),
          onSelect,
        },
        className: [selected ? 'is-selected' : '', related ? 'is-related' : '', dimmed ? 'is-dimmed' : ''].filter(Boolean).join(' '),
        style: {
          ...item.style,
          opacity: dimmed ? 0.1 : 1,
          strokeWidth: selected ? 3.4 : related ? 2.25 : item.style?.strokeWidth,
        },
        zIndex: selected || hovered ? 8 : related ? 4 : 1,
      }
    }),
    [active, graph.edges, graph.nodes.length, hoveredEdgeId, onSelect, selectedEdgeIds, t],
  )

  const graphKey = useMemo(
    () => `${graph.nodes.map((item) => item.id).join('|')}::${graph.edges.map((item) => item.id).join('|')}`,
    [graph.edges, graph.nodes],
  )

  useEffect(() => {
    if (previousGraphKey.current === graphKey) return undefined
    previousGraphKey.current = graphKey
    const timeout = window.setTimeout(() => {
      if (!selection || !frameNodes(flow, canvasRef, graph.nodes, inspectorWidth, 320)) {
        flow.fitView({ padding: 0.16, duration: 320, maxZoom: 1.12 })
      }
    }, 70)
    return () => window.clearTimeout(timeout)
  }, [canvasRef, flow, graph.nodes, graphKey, inspectorWidth, selection])

  useEffect(() => {
    if (!selectedNodeId || previousCenteredNode.current === selectedNodeId) return undefined
    previousCenteredNode.current = selectedNodeId
    const selected = graph.nodes.find((item) => item.id === selectedNodeId)
    if (!selected) return undefined
    const timeout = window.setTimeout(() => {
      // Bias the centre to the right of the node so it settles clear of the inspector.
      flow.setCenter(selected.position.x + 284, selected.position.y + nodeHeight / 2, { zoom: 1.03, duration: 320 })
    }, 40)
    return () => window.clearTimeout(timeout)
  }, [flow, graph.nodes, selectedNodeId])

  const selectedEdgeKey = [...selectedEdgeIds].sort().join('|')
  useEffect(() => {
    if (!selectedEdgeKey || previousCenteredEdge.current === selectedEdgeKey) return undefined
    previousCenteredEdge.current = selectedEdgeKey
    const selectedEdges = graph.edges.filter((item) => selectedEdgeIds.has(item.id))
    const selectedNodeIds = new Set(selectedEdges.flatMap((item) => [item.source, item.target]))
    const selectedNodes = graph.nodes.filter((item) => selectedNodeIds.has(item.id))
    if (!selectedNodes.length) return undefined
    const timeout = window.setTimeout(() => {
      // Frame both endpoints inside the area that remains visible beside the inspector.
      frameNodes(flow, canvasRef, selectedNodes, inspectorWidth)
    }, 120)
    return () => window.clearTimeout(timeout)
  }, [canvasRef, flow, graph.edges, graph.nodes, inspectorWidth, selectedEdgeIds, selectedEdgeKey])

  if (!nodes.length) {
    return (
      <div className="empty-canvas">
        <div className="empty-canvas__mark">∅</div>
        <h3>{t('canvas.emptyTitle')}</h3>
        <p>{t('canvas.emptyBody')}</p>
      </div>
    )
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      edgesFocusable
      minZoom={0.08}
      maxZoom={2.2}
      fitView
      fitViewOptions={{ padding: 0.16, maxZoom: 1.12 }}
      onlyRenderVisibleElements
      proOptions={{ hideAttribution: true }}
      onNodeClick={(_, item) => onSelect(item.data?.selection)}
      onNodeDoubleClick={(_, item) => {
        onSelect(item.data?.selection)
        onFocus(1)
      }}
      onEdgeClick={(_, item) => onSelect(item.data?.selection)}
      onEdgeMouseEnter={(_, item) => setHoveredEdgeId(item.id)}
      onEdgeMouseLeave={() => setHoveredEdgeId('')}
      onPaneClick={() => onSelect(null)}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color={tokens['canvas-dots']} />
      <Controls showInteractive={false} position="bottom-left" />
      {showMiniMap !== false && (
        <MiniMap
          pannable
          zoomable
          position="bottom-right"
          nodeColor={(item) => item.data?.kind === 'dataset'
            ? tokens['node-dataset']
            : item.data?.kind === 'metric'
              ? tokens['node-metric']
              : tokens['node-concept']}
          maskColor={tokens['canvas-minimap-mask']}
        />
      )}
    </ReactFlow>
  )
}

export default function GraphCanvas(props) {
  const canvasRef = useRef(null)
  return (
    <div ref={canvasRef} className={`graph-canvas ${props.selection ? 'has-inspector' : ''}`}>
      <ReactFlowProvider>
        <InnerGraphCanvas {...props} canvasRef={canvasRef} />
      </ReactFlowProvider>
    </div>
  )
}
