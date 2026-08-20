import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react'
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react'
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
  'canvas-dots': '#b9b9b9',
  'canvas-minimap-mask': 'rgba(245, 245, 245, 0.82)',
  'edge-neutral': '#9b9b9b',
  'graph-selection': '#4f8f75',
  'node-concept': '#4f8f75',
  'node-dataset': '#729b8b',
  'node-metric': '#8aa89d',
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
  const fitZoom = Math.min(1.06, availableWidth / boundsWidth, availableHeight / boundsHeight)
  // A mathematically complete fit can make metadata unreadable on a dense
  // ontology. Keep the initial overview legible (the toolbar still offers a
  // true fit-to-screen action) and bring a focused node close to native size.
  const minimumReadableZoom = items.length === 1 ? 0.92 : 0.56
  const zoom = Math.max(minimumReadableZoom, fitZoom)
  const contentCenterX = minX + boundsWidth / 2
  const contentCenterY = minY + boundsHeight / 2

  flow.setViewport({
    x: (canvas.width - inspectorReserve) / 2 - contentCenterX * zoom,
    y: canvas.height / 2 - contentCenterY * zoom,
    zoom,
  }, { duration })
  return true
}

function Toggle({ checked, onChange, label }) {
  return (
    <button className={`toggle ${checked ? 'is-active' : ''}`} onClick={() => onChange(!checked)}>
      <span />
      {label}
    </button>
  )
}

function GraphToolbar(props) {
  const t = useT()
  const flow = useReactFlow()
  const {
    activeTab,
    selection,
    focusDepth,
    onFocus,
    showRelationships,
    setShowRelationships,
    showMetrics,
    setShowMetrics,
    showMiniMap,
    setShowMiniMap,
    showEdgeLabels,
    setShowEdgeLabels,
    layoutEngine,
    setLayoutEngine,
  } = props

  return (
    <div className="graph-toolbar">
      <div className="toolbar-group">
        <button
          className="toolbar-btn"
          onClick={() => flow.zoomOut({ duration: 200 })}
          title={t('toolbar.zoomOut')}
        >
          <ZoomOut size={14} />
        </button>
        <button
          className="toolbar-btn toolbar-btn--text"
          onClick={() => flow.fitView({ padding: 0.16, duration: 250 })}
          title={t('toolbar.fitView')}
        >
          <Maximize2 size={13} />
          <span>{t('toolbar.fit')}</span>
        </button>
        <button
          className="toolbar-btn"
          onClick={() => flow.zoomIn({ duration: 200 })}
          title={t('toolbar.zoomIn')}
        >
          <ZoomIn size={14} />
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        {activeTab === 'ontology' && (
          <Toggle
            checked={showRelationships}
            onChange={setShowRelationships}
            label={t('toolbar.relationships')}
          />
        )}
        {activeTab === 'semantic' && (
          <Toggle
            checked={showMetrics}
            onChange={setShowMetrics}
            label={t('toolbar.metrics')}
          />
        )}
        <Toggle
          checked={showEdgeLabels}
          onChange={setShowEdgeLabels}
          label={t('toolbar.edgeLabels')}
        />
        <Toggle
          checked={showMiniMap}
          onChange={setShowMiniMap}
          label={t('toolbar.miniMap')}
        />
      </div>

      <div className="toolbar-divider" />

      <div className="segmented-switch" title={t('toolbar.layoutHint')}>
        {['dagre', 'elk'].map((engine) => (
          <button
            key={engine}
            className={layoutEngine === engine ? 'is-active' : ''}
            onClick={() => setLayoutEngine(engine)}
          >
            {engine === 'dagre' ? 'Dagre' : 'ELK'}
          </button>
        ))}
      </div>

      {activeTab !== 'mapping' && (
        <>
          <div className="toolbar-divider" />
          <div
            className="segmented-switch"
            title={selection ? t('toolbar.focusHint') : t('toolbar.focusHintEmpty')}
          >
            {[0, 1, 2].map((depth) => (
              <button
                key={depth}
                disabled={!selection && depth > 0}
                className={focusDepth === depth ? 'is-active' : ''}
                onClick={() => onFocus(depth)}
              >
                {depth === 0 ? t('toolbar.depthAll') : t('toolbar.depthHops', { count: depth })}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function InnerGraphCanvas(props) {
  const {
    graph,
    selection,
    showMiniMap,
    showEdgeLabels,
    setShowEdgeLabels,
    onSelect,
    onFocus,
    canvasRef,
    inspectorWidth,
    activeTab,
    showRelationships,
    setShowRelationships,
    showMetrics,
    setShowMetrics,
    setShowMiniMap,
    layoutEngine,
    setLayoutEngine,
    focusDepth,
  } = props
  const t = useT()
  const flow = useReactFlow()
  const tokens = useCssTokens(CANVAS_TOKENS)
  const graphNodesRef = useRef(graph.nodes)
  const selectedNodeFrameRef = useRef(null)
  const edgeFrameNodesRef = useRef([])
  const [hoveredEdgeId, setHoveredEdgeId] = useState('')
  const activeInspectorWidth = selection ? inspectorWidth : 0

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
    () =>
      graph.edges.map((item) => {
        const isEdgeSelected = selectedEdgeIds.has(item.id)
        const isConnectedToSelectedNode = selectedNodeId && (item.source === selectedNodeId || item.target === selectedNodeId)
        const isEdgeActive = isEdgeSelected || isConnectedToSelectedNode
        const isEdgeHovered = item.id === hoveredEdgeId
        const isEdgeHighlighted = isEdgeActive || isEdgeHovered
        const dimmed = active.enabled && !isEdgeActive && !isEdgeHovered
        const label = item.data?.label || ''
        return {
          ...item,
          selected: isEdgeHighlighted,
          label: label || undefined,
          markerEnd: {
            ...item.markerEnd,
            color: isEdgeHighlighted ? tokens['graph-selection'] : tokens['edge-neutral'],
          },
          labelStyle: {
            ...item.labelStyle,
            fill: isEdgeHighlighted ? tokens['graph-selection'] : '#767676',
            opacity: dimmed ? 0.38 : 1,
          },
          data: {
            ...item.data,
            dimmed,
            showEdgeLabels,
            onSelect,
          },
          className: [isEdgeHighlighted ? 'is-selected' : '', dimmed ? 'is-dimmed' : ''].filter(Boolean).join(' '),
          style: {
            ...item.style,
            opacity: dimmed ? 0.38 : 1,
            stroke: isEdgeHighlighted ? tokens['graph-selection'] : tokens['edge-neutral'],
            strokeWidth: isEdgeHighlighted ? 1.55 : item.style?.strokeWidth || 1.1,
          },
          zIndex: isEdgeHighlighted ? 100 : 1,
        }
      }),
    [active.enabled, graph.edges, hoveredEdgeId, onSelect, selectedEdgeIds, selectedNodeId, showEdgeLabels, tokens],
  )

  const graphKey = useMemo(
    () => `${graph.nodes.map((n) => n.id).sort().join(',')}:${graph.edges.map((e) => e.id).sort().join(',')}`,
    [graph.edges, graph.nodes],
  )
  graphNodesRef.current = graph.nodes

  useEffect(() => {
    if (!graphNodesRef.current.length) return undefined
    const timeout = window.setTimeout(() => {
      frameNodes(flow, canvasRef, graphNodesRef.current, activeInspectorWidth)
    }, 60)
    return () => window.clearTimeout(timeout)
  }, [activeInspectorWidth, canvasRef, flow, graphKey])

  const selectedNode = graph.nodes.find((item) => item.id === selectedNodeId)
  selectedNodeFrameRef.current = selectedNode || null
  const selectedNodeKey = selectedNode
    ? `${selectedNode.id}@${selectedNode.position.x},${selectedNode.position.y}`
    : ''
  useEffect(() => {
    if (!selectedNodeKey || !selectedNodeFrameRef.current) return undefined
    const timeout = window.setTimeout(() => {
      frameNodes(flow, canvasRef, [selectedNodeFrameRef.current], activeInspectorWidth, 240)
    }, 80)
    return () => window.clearTimeout(timeout)
  }, [activeInspectorWidth, canvasRef, flow, selectedNodeKey])

  const selectedEdgeKey = selectedEdgeIds.size ? [...selectedEdgeIds].sort().join(',') : ''
  const selectedEdges = graph.edges.filter((item) => selectedEdgeIds.has(item.id))
  const selectedEdgeNodeIds = new Set(selectedEdges.flatMap((item) => [item.source, item.target]))
  const edgeFrameNodes = graph.nodes.filter((item) => selectedEdgeNodeIds.has(item.id))
  edgeFrameNodesRef.current = edgeFrameNodes
  const edgeFrameKey = edgeFrameNodes
    .map((item) => `${item.id}@${item.position.x},${item.position.y}`)
    .sort()
    .join('|')
  useEffect(() => {
    if (!selectedEdgeKey || !edgeFrameNodesRef.current.length) return undefined
    const timeout = window.setTimeout(() => {
      frameNodes(flow, canvasRef, edgeFrameNodesRef.current, activeInspectorWidth)
    }, 120)
    return () => window.clearTimeout(timeout)
  }, [activeInspectorWidth, canvasRef, edgeFrameKey, flow, selectedEdgeKey])

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
      <Background variant={BackgroundVariant.Dots} gap={18} size={1.25} color={tokens['canvas-dots']} />
      {!nodes.length && (
        <Panel position="top-center" style={{ marginTop: '120px' }}>
          <div className="empty-canvas" style={{ height: 'auto' }}>
            <div className="empty-canvas__mark">∅</div>
            <h3>{t('canvas.emptyTitle')}</h3>
            <p>{t('canvas.emptyBody')}</p>
          </div>
        </Panel>
      )}
      <Panel position="bottom-center">
        <GraphToolbar
          activeTab={activeTab}
          selection={selection}
          focusDepth={focusDepth}
          onFocus={onFocus}
          showRelationships={showRelationships}
          setShowRelationships={setShowRelationships}
          showMetrics={showMetrics}
          setShowMetrics={setShowMetrics}
          showMiniMap={showMiniMap}
          setShowMiniMap={setShowMiniMap}
          showEdgeLabels={showEdgeLabels}
          setShowEdgeLabels={setShowEdgeLabels}
          layoutEngine={layoutEngine}
          setLayoutEngine={setLayoutEngine}
        />
      </Panel>
      {showMiniMap !== false && nodes.length > 0 && (
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
