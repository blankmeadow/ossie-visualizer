import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  getNodesBounds,
  getViewportForBounds,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
} from '@xyflow/react'
import { Download, Lock, Maximize, Unlock, ZoomIn, ZoomOut } from 'lucide-react'
import { toPng } from 'html-to-image'
import OssieNode from './OssieNode'
import RelationshipEdge from './RelationshipEdge'
import { useT } from '../lib/i18n'
import { useCssTokens } from '../lib/useCssTokens'
import { markerSizeForZoom, NODE_HEIGHT, NODE_WIDTH } from '../lib/graph'

const nodeTypes = { ossieNode: OssieNode }
const edgeTypes = { relationshipEdge: RelationshipEdge }
// Framing maths has to agree with the dimensions dagre laid the graph out with.
const nodeWidth = NODE_WIDTH
const nodeHeight = NODE_HEIGHT
const EMPTY_POSITIONS = Object.freeze({})
const EMPTY_SIZES = Object.freeze({})
const selectZoom = (state) => state.transform[2]

// Fallbacks match the light-theme values in styles/tokens.css; the live values
// are read from CSS so the canvas follows the active theme.
const CANVAS_TOKENS = {
  canvas: '#f5f5f5',
  'canvas-dots': '#b9b9b9',
  'canvas-minimap-mask': 'rgba(245, 245, 245, 0.82)',
  'edge-neutral': '#9b9b9b',
  'edge-marker': '#767676',
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

function imageName(documentName, activeTab) {
  const safeName = (documentName || 'ossie-graph')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${safeName || 'ossie-graph'}-${activeTab}.png`
}

function nextPaint() {
  return new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)))
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
    nodesLocked,
    setNodesLocked,
    onDownload,
    exporting,
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
          className="toolbar-btn toolbar-btn--icon"
          onClick={() => flow.fitView({ padding: 0.16, duration: 250 })}
          title={t('toolbar.fitView')}
          aria-label={t('toolbar.fitView')}
        >
          <Maximize size={14} />
        </button>
        <button
          className="toolbar-btn"
          onClick={() => flow.zoomIn({ duration: 200 })}
          title={t('toolbar.zoomIn')}
        >
          <ZoomIn size={14} />
        </button>
        <button
          className={`toolbar-btn toolbar-btn--icon ${!nodesLocked ? 'is-active' : ''}`}
          onClick={() => setNodesLocked(!nodesLocked)}
          title={t(nodesLocked ? 'toolbar.unlockNodes' : 'toolbar.lockNodes')}
          aria-label={t(nodesLocked ? 'toolbar.unlockNodes' : 'toolbar.lockNodes')}
          aria-pressed={!nodesLocked}
        >
          {nodesLocked ? <Lock size={13} /> : <Unlock size={13} />}
        </button>
        <button
          className="toolbar-btn toolbar-btn--icon"
          onClick={onDownload}
          title={t(exporting ? 'toolbar.exportingImage' : 'toolbar.downloadImage')}
          aria-label={t(exporting ? 'toolbar.exportingImage' : 'toolbar.downloadImage')}
          disabled={exporting}
        >
          <Download size={14} />
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
    documentName,
  } = props
  const t = useT()
  const flow = useReactFlow()
  // Subscribing through useViewport also listens to x/y and re-renders the
  // complete graph on every pan frame. Arrow sizing only needs zoom.
  const zoom = useStore(selectZoom)
  // Quantise the zoom used by marker definitions. The visual result remains
  // smooth while avoiding a brand-new SVG marker on every wheel delta.
  const viewportMarkerZoom = Math.max(0.08, Math.round(zoom * 50) / 50)
  const tokens = useCssTokens(CANVAS_TOKENS)
  const graphNodesRef = useRef(graph.nodes)
  const selectedNodeFrameRef = useRef(null)
  const edgeFrameNodesRef = useRef([])
  const nodeCacheRef = useRef(new Map())
  const [nodeSizes, setNodeSizes] = useState(EMPTY_SIZES)
  const [nodesLocked, setNodesLocked] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [exportZoom, setExportZoom] = useState(null)
  const [manualLayout, setManualLayout] = useState({ key: '', positions: {} })
  const activeInspectorWidth = selection ? inspectorWidth : 0
  const markerZoom = exportZoom || viewportMarkerZoom

  const graphLayoutKey = useMemo(
    () => `${graph.nodes
      .map((item) => `${item.id}@${item.position.x},${item.position.y}`)
      .sort()
      .join(',')}:${graph.edges.map((item) => item.id).sort().join(',')}`,
    [graph.edges, graph.nodes],
  )
  const manualPositions = manualLayout.key === graphLayoutKey ? manualLayout.positions : EMPTY_POSITIONS

  const selectedNodeId = useMemo(
    () => graph.nodes.find((item) => selectionMatches(item.data?.selection, selection))?.id || '',
    [graph.nodes, selection],
  )
  const selectedEdgeIds = useMemo(
    () => new Set(graph.edges.filter((item) => edgeMatchesSelection(item, selection)).map((item) => item.id)),
    [graph.edges, selection],
  )
  const activeNodeIds = useMemo(() => {
    const nodeIds = new Set()
    if (selectedNodeId) {
      nodeIds.add(selectedNodeId)
      for (const item of graph.edges) {
        if (item.source !== selectedNodeId && item.target !== selectedNodeId) continue
        nodeIds.add(item.source)
        nodeIds.add(item.target)
      }
    } else if (selectedEdgeIds.size) {
      for (const item of graph.edges) {
        if (!selectedEdgeIds.has(item.id)) continue
        nodeIds.add(item.source)
        nodeIds.add(item.target)
      }
    }
    return nodeIds
  }, [graph.edges, selectedEdgeIds, selectedNodeId])
  // Everything outside the selection and its immediate neighbours fades back,
  // but only once something on the canvas is actually selected: a selection the
  // graph does not draw (a value type, say) must not dim the whole view.
  const focusActive = activeNodeIds.size > 0

  // React Flow keeps a node's measurements only for as long as it keeps seeing
  // the same node object, and it hides any node it considers unmeasured along
  // with every edge attached to it. Dragging rebuilds this array on every
  // pointer frame, so nodes carry the measured size back in and untouched nodes
  // keep their identity; otherwise the graph blanks out until the resize
  // observer has measured it all over again, frame after frame.
  const nodes = useMemo(() => {
    const previous = nodeCacheRef.current
    const cache = new Map()
    const items = graph.nodes.map((item) => {
      const position = manualPositions[item.id] || item.position
      const selected = item.id === selectedNodeId
      const related = activeNodeIds.has(item.id) && !selected
      const dimmed = focusActive && !activeNodeIds.has(item.id)
      const measured = nodeSizes[item.id]
      const cached = previous.get(item.id)
      if (
        cached
        && cached.source === item
        && cached.node.position === position
        && cached.node.measured === measured
        && cached.node.selected === selected
        && cached.node.data.related === related
        && cached.node.data.dimmed === dimmed
      ) {
        cache.set(item.id, cached)
        return cached.node
      }
      const node = {
        ...item,
        position,
        measured,
        selected,
        zIndex: selected ? 1000 : 0,
        data: { ...item.data, related, dimmed },
      }
      cache.set(item.id, { source: item, node })
      return node
    })
    nodeCacheRef.current = cache
    return items
  }, [activeNodeIds, focusActive, graph.nodes, manualPositions, nodeSizes, selectedNodeId])

  const edges = useMemo(
    () =>
      graph.edges.map((item) => {
        const isEdgeSelected = selectedEdgeIds.has(item.id)
        const isConnectedToSelectedNode = selectedNodeId && (item.source === selectedNodeId || item.target === selectedNodeId)
        const isEdgeHighlighted = isEdgeSelected || isConnectedToSelectedNode
        const dimmed = focusActive && !isEdgeHighlighted
        const label = item.data?.label || ''
        const strokeWidth = isEdgeHighlighted ? 1.55 : item.style?.strokeWidth || 1.1
        const markerSize = markerSizeForZoom(markerZoom, strokeWidth, isEdgeHighlighted)
        return {
          ...item,
          selected: isEdgeSelected,
          label: label || undefined,
          markerEnd: {
            ...item.markerEnd,
            color: isEdgeHighlighted ? tokens['graph-selection'] : tokens['edge-marker'],
            width: markerSize,
            height: markerSize,
          },
          labelStyle: {
            ...item.labelStyle,
            fill: isEdgeHighlighted ? tokens['graph-selection'] : '#767676',
          },
          data: {
            ...item.data,
            dimmed,
            showEdgeLabels,
            onSelect,
          },
          className: isEdgeHighlighted ? 'is-selected' : '',
          style: {
            ...item.style,
            // Opacity on the path fades its arrowhead with it, and stays cheap
            // enough to repaint while the canvas is being panned or dragged.
            opacity: dimmed ? 0.3 : 1,
            stroke: isEdgeHighlighted ? tokens['graph-selection'] : tokens['edge-neutral'],
            strokeWidth,
          },
          zIndex: 0,
        }
      }),
    [focusActive, graph.edges, markerZoom, onSelect, selectedEdgeIds, selectedNodeId, showEdgeLabels, tokens],
  )
  graphNodesRef.current = nodes

  useEffect(() => {
    if (!graphNodesRef.current.length) return undefined
    const timeout = window.setTimeout(() => {
      frameNodes(flow, canvasRef, graphNodesRef.current, activeInspectorWidth)
    }, 60)
    return () => window.clearTimeout(timeout)
  }, [activeInspectorWidth, canvasRef, flow, graphLayoutKey])

  const selectedNode = nodes.find((item) => item.id === selectedNodeId)
  selectedNodeFrameRef.current = selectedNode || null
  const selectedNodeKey = selectedNode
    ? `${selectedNode.id}:${graphLayoutKey}`
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
  const edgeFrameNodes = nodes.filter((item) => selectedEdgeNodeIds.has(item.id))
  edgeFrameNodesRef.current = edgeFrameNodes
  const edgeFrameKey = selectedEdgeKey ? `${selectedEdgeKey}:${graphLayoutKey}` : ''
  useEffect(() => {
    if (!selectedEdgeKey || !edgeFrameNodesRef.current.length) return undefined
    const timeout = window.setTimeout(() => {
      frameNodes(flow, canvasRef, edgeFrameNodesRef.current, activeInspectorWidth)
    }, 120)
    return () => window.clearTimeout(timeout)
  }, [activeInspectorWidth, canvasRef, edgeFrameKey, flow, selectedEdgeKey])

  const handleNodesChange = useCallback((changes) => {
    // The size React Flow measured for a node is reported once, here. Keeping
    // it lets every later render hand the node back as an already measured one.
    const sizeChanges = changes.filter((change) => change.type === 'dimensions' && change.dimensions)
    if (sizeChanges.length) {
      setNodeSizes((current) => {
        let next = current
        for (const change of sizeChanges) {
          const { width, height } = change.dimensions
          const size = current[change.id]
          if (size && size.width === width && size.height === height) continue
          if (next === current) next = { ...current }
          next[change.id] = { width, height }
        }
        return next
      })
    }
    if (nodesLocked) return
    const positionChanges = changes.filter((change) => change.type === 'position' && change.position)
    if (!positionChanges.length) return
    setManualLayout((current) => {
      const positions = current.key === graphLayoutKey ? { ...current.positions } : {}
      for (const change of positionChanges) positions[change.id] = change.position
      return { key: graphLayoutKey, positions }
    })
  }, [graphLayoutKey, nodesLocked])

  const downloadImage = useCallback(async () => {
    if (exporting || !nodes.length) return
    setExporting(true)
    try {
      const viewport = canvasRef.current?.querySelector('.react-flow__viewport')
      const exportNodes = flow.getNodes()
      if (!viewport || !exportNodes.length) return

      const bounds = getNodesBounds(exportNodes)
      // Leave enough room for labels and marker tips, which can extend beyond
      // the node-only bounds returned by React Flow.
      const imageWidth = Math.ceil(Math.min(3200, Math.max(1200, bounds.width + 480)))
      const imageHeight = Math.ceil(Math.min(2400, Math.max(720, bounds.height + 360)))
      const exportViewport = getViewportForBounds(bounds, imageWidth, imageHeight, 0.05, 1.25, 0.12)
      // Arrowheads are screen-space adaptive. Recalculate them for the export
      // transform rather than baking in whichever zoom the user was viewing.
      setExportZoom(exportViewport.zoom)
      await nextPaint()
      const dataUrl = await toPng(viewport, {
        backgroundColor: tokens.canvas,
        cacheBust: true,
        width: imageWidth,
        height: imageHeight,
        pixelRatio: 1.5,
        style: {
          width: `${imageWidth}px`,
          height: `${imageHeight}px`,
          transformOrigin: 'top left',
          transform: `translate(${exportViewport.x}px, ${exportViewport.y}px) scale(${exportViewport.zoom})`,
        },
      })
      const link = document.createElement('a')
      link.download = imageName(documentName, activeTab)
      link.href = dataUrl
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (error) {
      console.error('Unable to export graph image', error)
    } finally {
      setExportZoom(null)
      setExporting(false)
    }
  }, [activeTab, canvasRef, documentName, exporting, flow, nodes.length, tokens.canvas])

  return (
    <ReactFlow
      className={nodesLocked ? 'is-locked' : 'is-unlocked'}
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      nodesDraggable={!nodesLocked}
      nodesConnectable={false}
      elementsSelectable
      edgesFocusable
      minZoom={0.08}
      maxZoom={2.2}
      fitView
      fitViewOptions={{ padding: 0.16, maxZoom: 1.12 }}
      proOptions={{ hideAttribution: true }}
      onNodesChange={handleNodesChange}
      onNodeClick={(_, item) => onSelect(item.data?.selection)}
      onNodeDoubleClick={(_, item) => {
        onSelect(item.data?.selection)
        onFocus(1)
      }}
      onEdgeClick={(_, item) => onSelect(item.data?.selection)}
      onPaneClick={() => onSelect(null)}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={16}
        size={1}
        color={tokens['canvas-dots']}
      />
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
          nodesLocked={nodesLocked}
          setNodesLocked={setNodesLocked}
          onDownload={downloadImage}
          exporting={exporting}
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
