import dagre from '@dagrejs/dagre'
import { MarkerType } from '@xyflow/react'
import { BUILTIN_CONCEPTS, mappingEvidenceForDataset, referencedDatasets } from './ossie'

const NODE_WIDTH = 248
const NODE_HEIGHT = 108

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
  edges.forEach((item) => graph.setEdge(item.source, item.target))
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
    ranksep: direction === 'TB' ? 96 : 118,
    nodesep: direction === 'TB' ? 56 : 48,
    componentGap: 86,
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

function layoutFocusedOntology(nodes, selectedId) {
  if (!nodes.length) return []
  const selected = nodes.find((item) => item.id === selectedId)
  if (!selected) return layout(nodes, [], 'TB')

  const others = nodes
    .filter((item) => item.id !== selectedId)
    .sort((left, right) => left.id.localeCompare(right.id))
  const columns = others.length <= 8 ? 3 : others.length <= 20 ? 4 : 5
  const columnGap = 72
  const rowGap = 74
  const gridWidth = columns * NODE_WIDTH + (columns - 1) * columnGap
  const firstRowY = NODE_HEIGHT + 128

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
  const colors = {
    inheritance: '#7c5ce7',
    relationship: '#3f718b',
    semantic: '#d16f3d',
    metric: '#b98b22',
    mapping: '#3f8068',
  }
  return {
    id,
    source,
    target,
    // Ontology and Mapping relationships often fan out from one node. Curved paths keep
    // them visually distinct; Mapping edges also use a narrow hit area and a dedicated
    // endpoint action so overlapping paths cannot silently select a neighboring edge.
    type: ['relationship', 'mapping'].includes(kind) ? 'relationshipEdge' : 'smoothstep',
    interactionWidth: kind === 'mapping' ? 7 : 28,
    markerEnd: { type: MarkerType.ArrowClosed, color: colors[kind] },
    style: {
      stroke: colors[kind],
      strokeWidth: kind === 'inheritance' ? 2.2 : 1.7,
      strokeDasharray: kind === 'inheritance' ? '7 5' : undefined,
    },
    labelStyle: { fontSize: 10, fill: '#34443d', fontWeight: 650 },
    labelBgStyle: { fill: '#fbfcf9', fillOpacity: 0.96, stroke: '#d5ddd8', strokeWidth: 1 },
    labelBgPadding: [7, 4],
    labelBgBorderRadius: 6,
    data: { kind, label, selection, ...extra },
  }
}

function node(id, kind, name, subtitle, item, extra = {}) {
  const selectionKind = kind === 'valueType' ? 'concept' : kind
  return {
    id,
    type: 'ossieNode',
    position: { x: 0, y: 0 },
    data: {
      kind,
      name,
      subtitle,
      item,
      selection: { kind: selectionKind, name, target: item },
      ...extra,
    },
  }
}

function attachHandles(nodes, edges, direction) {
  const outgoing = new Map(nodes.map((item) => [item.id, []]))
  const incoming = new Map(nodes.map((item) => [item.id, []]))
  for (const item of [...edges].sort((left, right) => left.id.localeCompare(right.id))) {
    outgoing.get(item.source)?.push(item)
    incoming.get(item.target)?.push(item)
  }

  const nodeHandles = new Map(nodes.map((item) => [item.id, { sourceHandles: [], targetHandles: [] }]))
  const handledEdges = edges.map((item) => {
    const selfLoop = item.source === item.target
    const sourceItems = outgoing.get(item.source) || []
    const targetItems = incoming.get(item.target) || []
    const sourceIndex = sourceItems.findIndex((candidate) => candidate.id === item.id)
    const targetIndex = targetItems.findIndex((candidate) => candidate.id === item.id)
    const sourceHandle = `source:${item.id}`
    const targetHandle = `target:${item.id}`
    nodeHandles.get(item.source)?.sourceHandles.push({
      id: sourceHandle,
      position: selfLoop ? 'right' : direction === 'TB' ? 'bottom' : 'right',
      offset: selfLoop ? 34 : ((sourceIndex + 1) / (sourceItems.length + 1)) * 100,
    })
    nodeHandles.get(item.target)?.targetHandles.push({
      id: targetHandle,
      position: selfLoop ? 'right' : direction === 'TB' ? 'top' : 'left',
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

function graphResult(nodes, edges, direction, positioner = layout) {
  return attachHandles(positioner(nodes, edges, direction), edges, direction)
}

export function buildOntologyGraph(model, options = {}) {
  const showRelationships = options.showRelationships ?? false
  const showValueTypes = options.showValueTypes ?? false
  const selectedName = options.selectedName || ''
  const depth = options.depth ?? 0
  const conceptNames = new Set(model.concepts.map((concept) => concept.concept))
  const adjacency = new Map(model.concepts.map((concept) => [concept.concept, new Set()]))

  for (const concept of model.concepts) {
    for (const parent of concept.extends || []) {
      if (conceptNames.has(parent)) {
        adjacency.get(concept.concept)?.add(parent)
        adjacency.get(parent)?.add(concept.concept)
      }
    }
    for (const relationship of concept.relationships || []) {
      for (const role of relationship.roles || []) {
        if (conceptNames.has(role.concept)) {
          adjacency.get(concept.concept)?.add(role.concept)
          adjacency.get(role.concept)?.add(concept.concept)
        }
      }
    }
  }

  let visible = new Set(model.concepts.map((concept) => concept.concept))
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

  const nodes = model.concepts
    .filter((concept) => visible.has(concept.concept))
    .filter((concept) => showValueTypes || concept.type !== 'ValueType')
    .map((concept) =>
      node(
        concept.concept,
        concept.type === 'ValueType' ? 'valueType' : 'concept',
        concept.concept,
        concept.description || concept.type,
        concept,
        {
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
  for (const concept of model.concepts) {
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
      ))
    }
  }

  if (showRelationships) {
    const grouped = new Map()
    for (const concept of model.concepts) {
      if (!nodeIds.has(concept.concept)) continue
      for (const relationship of concept.relationships || []) {
        const enriched = { ...relationship, owner: concept.concept, path: `${concept.concept}.${relationship.name}` }
        for (const role of relationship.roles || []) {
          if (!nodeIds.has(role.concept) || BUILTIN_CONCEPTS.has(role.concept)) continue
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
      const label = uniquePaths.length === 1 ? items[0].name : `${uniquePaths.length} 条关系`
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
        { relationPaths: uniquePaths, relationships: items },
      ))
    }
  }

  const positioner = selectedName && depth > 0
    ? (items) => layoutFocusedOntology(items, selectedName)
    : layout
  return graphResult(nodes, edges, 'TB', positioner)
}

export function buildSemanticGraph(model, options = {}) {
  const showMetrics = options.showMetrics ?? false
  const selectedName = options.selectedName || ''
  const includeMetrics = showMetrics || selectedName.startsWith('metric:')
  const depth = options.depth ?? 0
  const nodes = model.datasets.map((dataset) =>
    node(dataset.name, 'dataset', dataset.name, dataset.source || dataset.description, dataset, {
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
      nodes.push(node(metricId, 'metric', metric.name, metric.description || metric.datatype, metric, {
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

  if (!selectedName || depth === 0) return graphResult(nodes, edges, 'LR')
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
  return graphResult(filteredNodes, filteredEdges, 'LR')
}

function layoutMapping(nodes) {
  const concept = nodes[0]
  const mapping = nodes[1]
  const datasets = nodes.slice(2)
  const columns = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(datasets.length))))
  const xGap = NODE_WIDTH + 58
  const yGap = NODE_HEIGHT + 46
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

export function buildMappingGraph(model, conceptMapping) {
  if (!conceptMapping) return { nodes: [], edges: [] }
  const datasetNames = new Set(model.datasets.map((dataset) => dataset.name))
  const referenced = referencedDatasets(conceptMapping, datasetNames)
  const concept = model.conceptByName.get(conceptMapping.concept)
  const nodes = [
    node(`concept:${conceptMapping.concept}`, 'concept', conceptMapping.concept, concept?.description || 'Ontology Concept', concept, {
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
  const positioned = layoutMapping(nodes)
  return attachHandles(positioned, edges, 'LR')
}
