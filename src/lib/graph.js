import dagre from '@dagrejs/dagre'
import { MarkerType } from '@xyflow/react'
import { mappingEvidenceForDataset, referencedDatasets, relationshipKind, roleKind } from './ossie'

// Compact two-row card: kind on the first row, name and badges on the second.
export const NODE_WIDTH = 224
export const NODE_HEIGHT = 72

// Lazy-load ELK to keep the initial bundle small (~1.4 MB savings).
let elkInstance = null
async function getElk() {
  if (!elkInstance) {
    const ELK = (await import('elkjs/lib/elk.bundled.js')).default
    elkInstance = new ELK()
  }
  return elkInstance
}

function connectedComponents(nodes, edges) {
  const adjacency = new Map(nodes.map((item) => [item.id, new Set()]))
  for (const item of edges) {
    adjacency.get(item.source)?.add(item.target)
    adjacency.get(item.target)?.add(item.source)
  }

  const seen = new Set()
  const components = []
  for (const item of [...nodes].sort((left, right) => left.id.localeCompare(right.id))) {
    if (seen.has(item.id)) continue
    const ids = []
    const queue = [item.id]
    seen.add(item.id)
    while (queue.length) {
      const id = queue.shift()
      ids.push(id)
      for (const neighbor of adjacency.get(id) || []) {
        if (seen.has(neighbor)) continue
        seen.add(neighbor)
        queue.push(neighbor)
      }
    }
    components.push(ids)
  }
  return components.sort((left, right) => right.length - left.length || left[0].localeCompare(right[0]))
}

// ─── Dagre layout ────────────────────────────────────────────────────────────

function layoutComponent(nodes, edges, direction, options) {
  const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}))
  graph.setGraph({
    rankdir: direction,
    ranksep: options.ranksep,
    nodesep: options.nodesep,
    edgesep: 34,
    marginx: 26,
    marginy: 26,
    ranker: 'network-simplex',
  })
  nodes.forEach((item) => graph.setNode(item.id, { width: NODE_WIDTH, height: NODE_HEIGHT }))
  edges.forEach((item) => {
    // Rank direction is not always the direction the arrow points. An `extends`
    // edge is drawn child -> parent (the UML generalization convention), but the
    // parent has to sit on the earlier rank so inheritance reads top-down, so
    // dagre is given the reversed pair. See `rankReversed` on the edge.
    if (item.data?.rankReversed) graph.setEdge(item.target, item.source)
    else graph.setEdge(item.source, item.target)
  })
  dagre.layout(graph)

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const positioned = nodes.map((item) => {
    const position = graph.node(item.id)
    const x = position.x - NODE_WIDTH / 2
    const y = position.y - NODE_HEIGHT / 2
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + NODE_WIDTH)
    maxY = Math.max(maxY, y + NODE_HEIGHT)
    return { ...item, position: { x, y }, data: { ...item.data, direction } }
  })

  return {
    nodes: positioned,
    width: Math.max(NODE_WIDTH, maxX - minX),
    height: Math.max(NODE_HEIGHT, maxY - minY),
    minX,
    minY,
  }
}

function layout(nodes, edges, direction = 'LR', overrides = {}) {
  if (!nodes.length) return []
  const options = {
    ranksep: direction === 'TB' ? 64 : 84,
    nodesep: direction === 'TB' ? 30 : 30,
    componentGap: 60,
    packWidth: direction === 'TB' ? 1780 : 1960,
    ...overrides,
  }
  const nodeById = new Map(nodes.map((item) => [item.id, item]))
  const components = connectedComponents(nodes, edges)
  const layouts = components.map((ids) => {
    const idSet = new Set(ids)
    return layoutComponent(
      ids.map((id) => nodeById.get(id)),
      edges.filter((item) => idSet.has(item.source) && idSet.has(item.target)),
      direction,
      options,
    )
  })

  const result = []
  let cursorX = 0
  let cursorY = 0
  let rowHeight = 0
  for (const component of layouts) {
    if (cursorX > 0 && cursorX + component.width > options.packWidth) {
      cursorX = 0
      cursorY += rowHeight + options.componentGap
      rowHeight = 0
    }
    for (const item of component.nodes) {
      result.push({
        ...item,
        position: {
          x: item.position.x - component.minX + cursorX,
          y: item.position.y - component.minY + cursorY,
        },
      })
    }
    cursorX += component.width + options.componentGap
    rowHeight = Math.max(rowHeight, component.height)
  }
  return result
}

// ─── ELK layout ──────────────────────────────────────────────────────────────

const ELK_DIRECTION = { TB: 'DOWN', LR: 'RIGHT' }

function elkLayoutComponent(nodes, edges, direction, options) {
  const elkDir = ELK_DIRECTION[direction] || 'DOWN'

  // Build port lists per node from edges, so ELK knows how many connections
  // each side of a node carries and can space them properly.
  const portMap = new Map(nodes.map((item) => [item.id, []]))
  const edgePorts = new Map()
  for (const item of edges) {
    const sourcePortId = `source:${item.id}`
    const targetPortId = `target:${item.id}`
    const sourceSide = item.data?.rankReversed
      ? (direction === 'TB' ? 'NORTH' : 'WEST')
      : (direction === 'TB' ? 'SOUTH' : 'EAST')
    const targetSide = item.data?.rankReversed
      ? (direction === 'TB' ? 'SOUTH' : 'EAST')
      : (direction === 'TB' ? 'NORTH' : 'WEST')
    portMap.get(item.source)?.push({ id: sourcePortId, side: sourceSide })
    portMap.get(item.target)?.push({ id: targetPortId, side: targetSide })
    edgePorts.set(item.id, { sourcePortId, targetPortId })
  }

  const elkGraph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': elkDir,
      'org.eclipse.elk.portConstraints': 'FIXED_ORDER',
      'elk.spacing.nodeNode': String(options.nodesep),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(options.ranksep),
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.edgeRouting': 'ORTHOGONAL',
    },
    children: nodes.map((item) => ({
      id: item.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      properties: { 'org.eclipse.elk.portConstraints': 'FIXED_ORDER' },
      ports: (portMap.get(item.id) || []).map((port, index) => ({
        id: port.id,
        properties: {
          'org.eclipse.elk.port.side': port.side,
          'org.eclipse.elk.port.index': String(index),
        },
      })),
    })),
    edges: edges.map((item) => {
      const ports = edgePorts.get(item.id)
      return {
        id: item.id,
        sources: [ports.sourcePortId],
        targets: [ports.targetPortId],
      }
    }),
  }

  return getElk().then((instance) => instance.layout(elkGraph)).then((layoutedGraph) => {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    const positioned = nodes.map((item) => {
      const elkChild = layoutedGraph.children?.find((c) => c.id === item.id)
      const x = elkChild?.x ?? 0
      const y = elkChild?.y ?? 0
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x + NODE_WIDTH)
      maxY = Math.max(maxY, y + NODE_HEIGHT)
      return { ...item, position: { x, y }, data: { ...item.data, direction } }
    })
    return {
      nodes: positioned,
      width: Math.max(NODE_WIDTH, maxX - minX),
      height: Math.max(NODE_HEIGHT, maxY - minY),
      minX,
      minY,
    }
  })
}

async function elkLayoutAll(nodes, edges, direction = 'LR', overrides = {}) {
  if (!nodes.length) return []
  const options = {
    ranksep: direction === 'TB' ? 72 : 92,
    nodesep: direction === 'TB' ? 34 : 32,
    componentGap: 64,
    packWidth: direction === 'TB' ? 1780 : 1960,
    ...overrides,
  }
  const nodeById = new Map(nodes.map((item) => [item.id, item]))
  const components = connectedComponents(nodes, edges)
  const layouts = await Promise.all(components.map((ids) => {
    const idSet = new Set(ids)
    return elkLayoutComponent(
      ids.map((id) => nodeById.get(id)),
      edges.filter((item) => idSet.has(item.source) && idSet.has(item.target)),
      direction,
      options,
    )
  }))

  const result = []
  let cursorX = 0
  let cursorY = 0
  let rowHeight = 0
  for (const component of layouts) {
    if (cursorX > 0 && cursorX + component.width > options.packWidth) {
      cursorX = 0
      cursorY += rowHeight + options.componentGap
      rowHeight = 0
    }
    for (const item of component.nodes) {
      result.push({
        ...item,
        position: {
          x: item.position.x - component.minX + cursorX,
          y: item.position.y - component.minY + cursorY,
        },
      })
    }
    cursorX += component.width + options.componentGap
    rowHeight = Math.max(rowHeight, component.height)
  }
  return result
}

// ─── Shared ──────────────────────────────────────────────────────────────────

function layoutFocusedOntology(nodes, selectedId) {
  if (!nodes.length) return []
  const selected = nodes.find((item) => item.id === selectedId)
  if (!selected) return layout(nodes, [], 'TB')

  const others = nodes
    .filter((item) => item.id !== selectedId)
    .sort((left, right) => left.id.localeCompare(right.id))
  const columns = others.length <= 8 ? 3 : others.length <= 20 ? 4 : 5
  const columnGap = 48
  const rowGap = 52
  const gridWidth = columns * NODE_WIDTH + (columns - 1) * columnGap
  const firstRowY = NODE_HEIGHT + 90

  return [
    {
      ...selected,
      position: { x: gridWidth / 2 - NODE_WIDTH / 2, y: 0 },
      data: { ...selected.data, direction: 'TB' },
    },
    ...others.map((item, index) => ({
      ...item,
      position: {
        x: (index % columns) * (NODE_WIDTH + columnGap),
        y: firstRowY + Math.floor(index / columns) * (NODE_HEIGHT + rowGap),
      },
      data: { ...item.data, direction: 'TB' },
    })),
  ]
}

function edge(id, source, target, label, kind, selection, extra = {}) {
  const neutral = '#9b9b9b'
  return {
    id,
    source,
    target,
    // Ontology and Mapping relationships often fan out from one node. Curved paths keep
    // them visually distinct; Mapping edges also use a narrow hit area and a dedicated
    // endpoint action so overlapping paths cannot silently select a neighboring edge.
    type: ['relationship', 'mapping'].includes(kind) ? 'relationshipEdge' : 'smoothstep',
    interactionWidth: kind === 'mapping' ? 7 : 28,
    markerEnd: { type: MarkerType.ArrowClosed, color: neutral },
    style: {
      stroke: neutral,
      strokeWidth: kind === 'inheritance' ? 2.2 : 1.7,
      strokeDasharray: kind === 'inheritance' ? '7 5' : undefined,
    },
    labelStyle: { fontSize: 10, fill: '#767676', fontWeight: 600 },
    labelBgStyle: { fill: '#f5f5f5', fillOpacity: 0.92, stroke: 'transparent', strokeWidth: 0 },
    labelBgPadding: [7, 4],
    labelBgBorderRadius: 6,
    data: { kind, label, selection, ...extra },
  }
}

function node(id, kind, name, subtitle, item, extra = {}) {
  return {
    id,
    type: 'ossieNode',
    position: { x: 0, y: 0 },
    data: {
      kind,
      name,
      subtitle,
      item,
      selection: { kind, name, target: item },
      ...extra,
    },
  }
}

/**
 * Decide which side of each node an edge leaves from and arrives at.
 *
 * The sides come from where the nodes actually ended up, not from the requested
 * rank direction. That matters because rank order and arrow direction can
 * disagree: an `extends` edge points child -> parent while the parent is laid
 * out above, so the arrow has to leave the child's top edge and enter the
 * parent's bottom edge. Reading the positions keeps every such case consistent
 * and gives the property that, for any node, edges arriving from earlier ranks
 * touch one side and edges leaving toward later ranks touch the opposite one.
 */
function edgeSides(sourceNode, targetNode, direction) {
  if (!sourceNode || !targetNode) {
    return direction === 'TB' ? ['bottom', 'top'] : ['right', 'left']
  }
  if (direction === 'TB') {
    const forward = targetNode.position.y >= sourceNode.position.y
    return forward ? ['bottom', 'top'] : ['top', 'bottom']
  }
  const forward = targetNode.position.x >= sourceNode.position.x
  return forward ? ['right', 'left'] : ['left', 'right']
}

function attachHandles(nodes, edges, direction) {
  const nodeById = new Map(nodes.map((item) => [item.id, item]))
  // Group by the side an edge actually uses, so the fan-out offsets spread
  // across that side only. Mixing arriving and leaving edges into one counter
  // used to bunch them together on a single edge of the node.
  const bySide = new Map(nodes.map((item) => [item.id, new Map()]))
  const sideKey = (nodeId, side) => {
    const sides = bySide.get(nodeId)
    if (!sides) return null
    if (!sides.has(side)) sides.set(side, [])
    return sides.get(side)
  }

  const sorted = [...edges].sort((left, right) => left.id.localeCompare(right.id))
  const resolved = new Map()
  for (const item of sorted) {
    const selfLoop = item.source === item.target
    const [sourceSide, targetSide] = selfLoop
      ? ['right', 'right']
      : edgeSides(nodeById.get(item.source), nodeById.get(item.target), direction)
    resolved.set(item.id, { sourceSide, targetSide, selfLoop })
    if (selfLoop) continue
    sideKey(item.source, sourceSide)?.push(item.id)
    sideKey(item.target, targetSide)?.push(item.id)
  }

  const nodeHandles = new Map(nodes.map((item) => [item.id, { sourceHandles: [], targetHandles: [] }]))
  const handledEdges = edges.map((item) => {
    const { sourceSide, targetSide, selfLoop } = resolved.get(item.id)
    const sourceItems = selfLoop ? [] : bySide.get(item.source)?.get(sourceSide) || []
    const targetItems = selfLoop ? [] : bySide.get(item.target)?.get(targetSide) || []
    const sourceIndex = sourceItems.indexOf(item.id)
    const targetIndex = targetItems.indexOf(item.id)
    const sourceHandle = `source:${item.id}`
    const targetHandle = `target:${item.id}`
    nodeHandles.get(item.source)?.sourceHandles.push({
      id: sourceHandle,
      position: sourceSide,
      offset: selfLoop ? 34 : ((sourceIndex + 1) / (sourceItems.length + 1)) * 100,
    })
    nodeHandles.get(item.target)?.targetHandles.push({
      id: targetHandle,
      position: targetSide,
      offset: selfLoop ? 72 : ((targetIndex + 1) / (targetItems.length + 1)) * 100,
    })
    return {
      ...item,
      type: selfLoop ? 'default' : item.type,
      sourceHandle,
      targetHandle,
    }
  })

  return {
    nodes: nodes.map((item) => ({ ...item, data: { ...item.data, ...nodeHandles.get(item.id) } })),
    edges: handledEdges,
  }
}

/**
 * Run layout and attach handles. Supports both Dagre (sync) and ELK (async).
 * Returns a plain object when using Dagre, or a Promise when using ELK.
 */
function graphResult(nodes, edges, direction, positioner = layout, engine = 'dagre') {
  if (engine === 'elk') {
    return elkLayoutAll(nodes, edges, direction).then((positioned) =>
      attachHandles(positioned, edges, direction),
    )
  }
  return attachHandles(positioner(nodes, edges, direction), edges, direction)
}

/**
 * The ontology canvas is a map of entities and the links between them.
 *
 * Value types are not drawn: an `EntityType -> ValueType` relationship is an
 * attribute of that entity, which the inspector shows as a row in the concept's
 * attribute table. Mixing the two on one canvas puts links of two entirely
 * different kinds on the same footing.
 */
export function buildOntologyGraph(model, options = {}) {
  const layoutEngine = options.layoutEngine || 'dagre'
  const showRelationships = options.showRelationships ?? false
  const selectedName = options.selectedName || ''
  const depth = options.depth ?? 0
  const entities = model.concepts.filter((concept) => concept.type !== 'ValueType')
  const conceptNames = new Set(entities.map((concept) => concept.concept))
  const adjacency = new Map(entities.map((concept) => [concept.concept, new Set()]))

  for (const concept of entities) {
    for (const parent of concept.extends || []) {
      if (conceptNames.has(parent)) {
        adjacency.get(concept.concept)?.add(parent)
        adjacency.get(parent)?.add(concept.concept)
      }
    }
    for (const relationship of concept.relationships || []) {
      for (const role of relationship.roles || []) {
        // Neighbourhood focus follows entity links only, otherwise a shared
        // value type such as `String` would drag unrelated entities in.
        if (roleKind(role.concept, model) !== 'entity' || !conceptNames.has(role.concept)) continue
        adjacency.get(concept.concept)?.add(role.concept)
        adjacency.get(role.concept)?.add(concept.concept)
      }
    }
  }

  let visible = new Set(conceptNames)
  if (selectedName && depth > 0 && conceptNames.has(selectedName)) {
    visible = new Set([selectedName])
    let frontier = [selectedName]
    for (let currentDepth = 0; currentDepth < depth; currentDepth += 1) {
      const next = []
      for (const name of frontier) {
        for (const neighbor of adjacency.get(name) || []) {
          if (!visible.has(neighbor)) next.push(neighbor)
          visible.add(neighbor)
        }
      }
      frontier = next
    }
  }

  const nodes = entities
    .filter((concept) => visible.has(concept.concept))
    .map((concept) =>
      node(
        concept.concept,
        'concept',
        concept.concept,
        // No subtitle: the header already states EntityType / ValueType.
        '',
        concept,
        {
          description: concept.description,
          badges: [
            concept.extends?.length ? `${concept.extends.length} parent` : null,
            concept.identify_by?.length ? `${concept.identify_by.length} key` : null,
            concept.derived_by?.length ? 'derived' : null,
          ].filter(Boolean),
        },
      ),
    )

  const nodeIds = new Set(nodes.map((item) => item.id))
  const edges = []
  for (const concept of entities) {
    if (!nodeIds.has(concept.concept)) continue
    for (const parent of concept.extends || []) {
      if (!nodeIds.has(parent)) continue
      edges.push(edge(
        `extends:${concept.concept}:${parent}`,
        concept.concept,
        parent,
        'extends',
        'inheritance',
        {
          kind: 'inheritance',
          name: `${concept.concept} extends ${parent}`,
          target: {
            child: concept.concept,
            parent,
            childConcept: concept,
            parentConcept: model.conceptByName.get(parent),
          },
        },
        // Draw the arrow child -> parent, but rank the parent first so the
        // inheritance hierarchy reads top-down.
        { rankReversed: true },
      ))
    }
  }

  if (showRelationships) {
    const grouped = new Map()
    for (const concept of entities) {
      if (!nodeIds.has(concept.concept)) continue
      for (const relationship of concept.relationships || []) {
        const kind = relationshipKind(relationship, model)
        // An attribute belongs in the concept's attribute table, not on the canvas.
        if (kind === 'attribute' || kind === 'unary') continue
        const enriched = {
          ...relationship,
          owner: concept.concept,
          path: `${concept.concept}.${relationship.name}`,
          relationshipKind: kind,
        }
        for (const role of relationship.roles || []) {
          // An objectified fact type mixes entity and value roles; only the
          // entity ends can be drawn, the value ends stay in the table.
          if (roleKind(role.concept, model) !== 'entity' || !nodeIds.has(role.concept)) continue
          const key = `${concept.concept}\u0000${role.concept}`
          const items = grouped.get(key) || []
          items.push({ ...enriched, selectedRole: role })
          grouped.set(key, items)
        }
      }
    }
    for (const [key, items] of grouped) {
      const [source, target] = key.split('\u0000')
      const uniquePaths = [...new Set(items.map((item) => item.path))]
      // A bundle's label depends on the active language, so the count travels
      // on the edge and the canvas renders the wording.
      const label = uniquePaths.length === 1 ? items[0].name : ''
      const selection = uniquePaths.length === 1
        ? { kind: 'relationship', name: items[0].path, target: items[0] }
        : { kind: 'relationshipGroup', name: `${source} → ${target}`, target: { source, target, items } }
      edges.push(edge(
        `relation:${source}:${target}`,
        source,
        target,
        label,
        'relationship',
        selection,
        {
          relationPaths: uniquePaths,
          relationships: items,
          relationshipKind: items[0].relationshipKind,
          bundleCount: uniquePaths.length,
        },
      ))
    }
  }

  const positioner = selectedName && depth > 0
    ? (items) => layoutFocusedOntology(items, selectedName)
    : layout
  return graphResult(nodes, edges, 'TB', positioner, layoutEngine)
}

export function buildSemanticGraph(model, options = {}) {
  const layoutEngine = options.layoutEngine || 'dagre'
  const showMetrics = options.showMetrics ?? false
  const selectedName = options.selectedName || ''
  const includeMetrics = showMetrics || selectedName.startsWith('metric:')
  const depth = options.depth ?? 0
  const nodes = model.datasets.map((dataset) =>
    node(dataset.name, 'dataset', dataset.name, dataset.source, dataset, {
      description: dataset.description,
      badges: [`${dataset.fields?.length || 0} fields`],
    }),
  )
  const edges = model.semanticRelationships
    .filter((relationship) => model.datasetByName.has(relationship.from) && model.datasetByName.has(relationship.to))
    .map((relationship, index) =>
      edge(
        `semantic:${relationship._semanticModel}:${relationship.name}:${index}`,
        relationship.from,
        relationship.to,
        relationship.name,
        'semantic',
        { kind: 'semanticRelationship', name: relationship.name, target: relationship },
      ),
    )

  if (includeMetrics) {
    const datasetNames = new Set(model.datasets.map((dataset) => dataset.name))
    for (const metric of model.metrics) {
      const metricId = `metric:${metric.name}`
      nodes.push(node(metricId, 'metric', metric.name, metric.datatype, metric, {
        description: metric.description,
        selection: { kind: 'metric', name: metric.name, target: metric },
      }))
      for (const datasetName of referencedDatasets(metric, datasetNames)) {
        edges.push(edge(
          `metric:${metric.name}:${datasetName}`,
          datasetName,
          metricId,
          'feeds metric',
          'metric',
          {
            kind: 'metricDependency',
            name: `${datasetName} → ${metric.name}`,
            target: { dataset: model.datasetByName.get(datasetName), metric },
          },
        ))
      }
    }
  }

  if (!selectedName || depth === 0) return graphResult(nodes, edges, 'TB', layout, layoutEngine)
  const adjacency = new Map(nodes.map((item) => [item.id, new Set()]))
  edges.forEach((item) => {
    adjacency.get(item.source)?.add(item.target)
    adjacency.get(item.target)?.add(item.source)
  })
  const visible = new Set([selectedName])
  let frontier = [selectedName]
  for (let currentDepth = 0; currentDepth < depth; currentDepth += 1) {
    const next = []
    for (const name of frontier) {
      for (const neighbor of adjacency.get(name) || []) {
        if (!visible.has(neighbor)) next.push(neighbor)
        visible.add(neighbor)
      }
    }
    frontier = next
  }
  const filteredNodes = nodes.filter((item) => visible.has(item.id))
  const filteredEdges = edges.filter((item) => visible.has(item.source) && visible.has(item.target))
  return graphResult(filteredNodes, filteredEdges, 'TB', layout, layoutEngine)
}

function layoutMapping(nodes) {
  const concept = nodes[0]
  const mapping = nodes[1]
  const datasets = nodes.slice(2)
  const columns = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(datasets.length))))
  const xGap = NODE_WIDTH + 36
  const yGap = NODE_HEIGHT + 30
  const rows = Math.ceil(datasets.length / columns)
  const centerY = Math.max(0, (rows - 1) * yGap / 2)
  return [
    { ...concept, position: { x: 0, y: centerY }, data: { ...concept.data, direction: 'LR' } },
    { ...mapping, position: { x: 350, y: centerY }, data: { ...mapping.data, direction: 'LR' } },
    ...datasets.map((item, index) => ({
      ...item,
      position: {
        x: 720 + (index % columns) * xGap,
        y: Math.floor(index / columns) * yGap,
      },
      data: { ...item.data, direction: 'LR' },
    })),
  ]
}

export function buildMappingGraph(model, conceptMapping, options = {}) {
  const layoutEngine = options.layoutEngine || 'dagre'
  if (!conceptMapping) return { nodes: [], edges: [] }
  const datasetNames = new Set(model.datasets.map((dataset) => dataset.name))
  const referenced = referencedDatasets(conceptMapping, datasetNames)
  const concept = model.conceptByName.get(conceptMapping.concept)
  const nodes = [
    node(`concept:${conceptMapping.concept}`, 'concept', conceptMapping.concept, '', concept, {
      description: concept?.description,
      selection: { kind: 'concept', name: conceptMapping.concept, target: concept },
    }),
    node(`mapping:${conceptMapping.concept}`, 'mapping', conceptMapping._mappingName, 'Concept Mapping', conceptMapping, {
      selection: { kind: 'mapping', name: conceptMapping.concept, target: conceptMapping },
    }),
  ]
  const edges = [
    edge(
      `mapping-link:${conceptMapping.concept}`,
      `concept:${conceptMapping.concept}`,
      `mapping:${conceptMapping.concept}`,
      'mapped by',
      'mapping',
      {
        kind: 'mappingEvidence',
        name: `${conceptMapping.concept} mapped by ${conceptMapping._mappingName}`,
        target: { type: 'concept-mapping', conceptMapping, referencedDatasets: referenced },
      },
    ),
  ]
  for (const datasetName of referenced) {
    const dataset = model.datasetByName.get(datasetName)
    const evidence = mappingEvidenceForDataset(conceptMapping, datasetName)
    nodes.push(node(`dataset:${datasetName}`, 'dataset', datasetName, dataset?.source || '', dataset, {
      description: dataset?.description,
      selection: { kind: 'dataset', name: datasetName, target: dataset },
    }))
    edges.push(
      edge(
        `mapping-dataset:${conceptMapping.concept}:${datasetName}`,
        `mapping:${conceptMapping.concept}`,
        `dataset:${datasetName}`,
        'references',
        'mapping',
        {
          kind: 'mappingEvidence',
          name: `${conceptMapping.concept} → ${datasetName}`,
          target: { type: 'dataset-mapping', conceptMapping, dataset, evidence },
        },
      ),
    )
  }
  if (layoutEngine === 'elk') {
    return elkLayoutAll(nodes, edges, 'LR').then((positioned) =>
      attachHandles(positioned, edges, 'LR'),
    )
  }
  const positioned = layoutMapping(nodes)
  return attachHandles(positioned, edges, 'LR')
}
