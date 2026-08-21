import dagre from '@dagrejs/dagre'
import { MarkerType } from '@xyflow/react'
import { mappingEvidenceForDataset, referencedDatasets, relationshipKind, roleKind } from './ossie'

// Compact two-row card: name on the first row, description on the second.
export const NODE_WIDTH = 224
export const NODE_HEIGHT = 72

/**
 * SVG markers use `markerUnits="strokeWidth"` and are then scaled again by
 * React Flow's viewport. Compensate for both factors so an arrowhead stays at
 * a readable screen size instead of disappearing when a large graph is fit.
 */
export function markerSizeForZoom(zoom, strokeWidth = 1.1, highlighted = false) {
  const safeZoom = Math.max(0.08, Number.isFinite(zoom) ? zoom : 1)
  const safeStrokeWidth = Math.max(0.5, Number.isFinite(strokeWidth) ? strokeWidth : 1.1)
  const desiredPixels = highlighted ? 15 : 13
  const size = desiredPixels / (safeZoom * safeStrokeWidth)
  return Math.round(Math.min(100, Math.max(4, size)) * 10) / 10
}

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

/**
 * Lay the separately-laid-out components out beside each other, in rows.
 *
 * Everything a component produced -- its cards and the routes its edges take --
 * shifts by the same amount, so a route still lines up with the cards it was
 * threaded between.
 */
function packComponents(layouts, options) {
  const nodes = []
  const routes = new Map()
  let cursorX = 0
  let cursorY = 0
  let rowHeight = 0
  for (const component of layouts) {
    if (cursorX > 0 && cursorX + component.width > options.packWidth) {
      cursorX = 0
      cursorY += rowHeight + options.componentGap
      rowHeight = 0
    }
    const shiftX = cursorX - component.minX
    const shiftY = cursorY - component.minY
    for (const item of component.nodes) {
      nodes.push({
        ...item,
        position: { x: item.position.x + shiftX, y: item.position.y + shiftY },
      })
    }
    for (const [id, route] of component.routes || []) {
      routes.set(id, route.map((point) => ({ x: point.x + shiftX, y: point.y + shiftY })))
    }
    cursorX += component.width + options.componentGap
    rowHeight = Math.max(rowHeight, component.height)
  }
  return { nodes, routes }
}

function layoutComponent(nodes, edges, direction, options) {
  // A multigraph so every edge keeps its own route: two concepts can be joined
  // by a relationship and an `extends` at once, and both directions of an
  // inverse pair rank the same way round.
  const graph = new dagre.graphlib.Graph({ multigraph: true }).setDefaultEdgeLabel(() => ({}))
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
    if (item.data?.rankReversed) graph.setEdge(item.target, item.source, {}, item.id)
    else graph.setEdge(item.source, item.target, {}, item.id)
  })
  dagre.layout(graph)

  // Dagre routes each edge as it lays the ranks out, standing a dummy node in
  // every rank an edge crosses, so its own route is already clear of the cards.
  // A reversed edge was handed over the other way round and comes back that way.
  const routes = new Map(edges.map((item) => {
    const route = finitePoints(graph.edge(
      item.data?.rankReversed ? item.target : item.source,
      item.data?.rankReversed ? item.source : item.target,
      item.id,
    )?.points)
    return [item.id, item.data?.rankReversed ? route.reverse() : route]
  }))

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
    routes,
    width: Math.max(NODE_WIDTH, maxX - minX),
    height: Math.max(NODE_HEIGHT, maxY - minY),
    minX,
    minY,
  }
}

function layout(nodes, edges, direction = 'LR', overrides = {}) {
  if (!nodes.length) return { nodes: [], routes: new Map() }
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

  return packComponents(layouts, options)
}

// ─── ELK layout ──────────────────────────────────────────────────────────────

const ELK_DIRECTION = { TB: 'DOWN', LR: 'RIGHT' }
const REACT_FLOW_SIDE = { NORTH: 'top', EAST: 'right', SOUTH: 'bottom', WEST: 'left' }

function elkPortSides(item, direction) {
  if (item.data?.rankReversed) {
    return direction === 'TB' ? ['NORTH', 'SOUTH'] : ['WEST', 'EAST']
  }
  return direction === 'TB' ? ['SOUTH', 'NORTH'] : ['EAST', 'WEST']
}

function elkLayoutComponent(nodes, edges, direction, options) {
  const elkDir = ELK_DIRECTION[direction] || 'DOWN'

  // Build port lists per node from edges, so ELK knows how many connections
  // each side of a node carries and can space them properly.
  const portMap = new Map(nodes.map((item) => [item.id, []]))
  const edgePorts = new Map()
  for (const item of edges) {
    const sourcePortId = `source:${item.id}`
    const targetPortId = `target:${item.id}`
    const [sourceSide, targetSide] = elkPortSides(item, direction)
    portMap.get(item.source)?.push({ id: sourcePortId, side: sourceSide })
    portMap.get(item.target)?.push({ id: targetPortId, side: targetSide })
    edgePorts.set(item.id, { sourcePortId, targetPortId })
  }

  const elkGraph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': elkDir,
      'elk.spacing.nodeNode': String(options.nodesep),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(options.ranksep),
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.edgeRouting': 'ORTHOGONAL',
    },
    children: nodes.map((item) => ({
      id: item.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      // Only the face is fixed. ELK remains free to order ports along it while
      // minimizing crossings, because the UI has no pre-existing port order.
      properties: { 'org.eclipse.elk.portConstraints': 'FIXED_SIDE' },
      ports: (portMap.get(item.id) || []).map((port) => ({
        id: port.id,
        properties: {
          'org.eclipse.elk.port.side': port.side,
        },
      })),
    })),
    edges: edges.map((item) => {
      const ports = edgePorts.get(item.id)
      return {
        id: item.id,
        // Inheritance is drawn child -> parent, but ranked parent -> child.
        // Reverse it only inside ELK and turn its returned route back around.
        sources: [item.data?.rankReversed ? ports.targetPortId : ports.sourcePortId],
        targets: [item.data?.rankReversed ? ports.sourcePortId : ports.targetPortId],
      }
    }),
  }

  return getElk().then((instance) => instance.layout(elkGraph)).then((layoutedGraph) => {
    // ELK is asked for orthogonal routing above, so it hands back the bends it
    // routed each edge through, in the same coordinates as the cards.
    const edgeById = new Map(edges.map((item) => [item.id, item]))
    const routes = new Map((layoutedGraph.edges || []).map((item) => {
      const section = item.sections?.[0]
      if (!section) return [item.id, []]
      const route = finitePoints([section.startPoint, ...(section.bendPoints || []), section.endPoint])
      return [item.id, edgeById.get(item.id)?.data?.rankReversed ? route.reverse() : route]
    }))
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
      routes,
      width: Math.max(NODE_WIDTH, maxX - minX),
      height: Math.max(NODE_HEIGHT, maxY - minY),
      minX,
      minY,
    }
  })
}

async function elkLayoutAll(nodes, edges, direction = 'LR', overrides = {}) {
  if (!nodes.length) return { nodes: [], routes: new Map() }
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

  return packComponents(layouts, options)
}

// ─── Shared ──────────────────────────────────────────────────────────────────

function layoutFocusedOntology(nodes, selectedId) {
  if (!nodes.length) return { nodes: [], routes: new Map() }
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

  return {
    nodes: [
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
    ],
    routes: new Map(),
  }
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
    // `extends` is drawn by the same edge as the relationships it sits among -- it keeps
    // its dashes, and it stops being the one line on the ontology canvas that turns
    // square corners and walks through whatever card is in the way.
    type: ['relationship', 'mapping', 'inheritance'].includes(kind) ? 'relationshipEdge' : 'smoothstep',
    interactionWidth: kind === 'mapping' ? 7 : 28,
    markerEnd: { type: MarkerType.ArrowClosed, color: neutral, width: 7, height: 7 },
    style: {
      stroke: neutral,
      strokeWidth: kind === 'inheritance' ? 1.15 : 1.1,
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

// ─── Edge routing ────────────────────────────────────────────────────────────

// A bend the layout put less than this far off the straight line between the
// two handles is not saying anything, so the edge is drawn without it.
const BEND_TOLERANCE = 14

/**
 * The points of an engine route that can actually be drawn.
 *
 * Dagre occasionally hands back a null point in the middle of a route it
 * could not place, and one of those in a path turns the whole path into
 * `NaN`, which SVG drops on the floor along with the rest of the edge.
 */
function finitePoints(route) {
  return (route || []).filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y))
}

/** How far `point` sits off the line between `from` and `to`. */
function offLine(from, to, point) {
  const span = Math.hypot(to.x - from.x, to.y - from.y) || 1
  return Math.abs(
    ((point.x - from.x) * (to.y - from.y) - (point.y - from.y) * (to.x - from.x)) / span,
  )
}

/**
 * The bends worth drawing out of a route the layout engine worked out.
 *
 * Both engines route their own edges -- Dagre reserves a lane for every rank an
 * edge crosses by standing a dummy node in it, ELK is asked for orthogonal
 * routing outright -- so the way around the cards in between is theirs to
 * compute rather than ours to guess at. A route arrives as one point per rank,
 * most of them in a straight run, and a run of points saying the same thing as
 * the line through them is a heavier path for no more meaning.
 */
export function layoutBends(route) {
  if (!route || route.length < 3) return []
  const bends = []
  let anchor = route[0]
  for (let index = 1; index < route.length - 1; index++) {
    const next = route[index + 1]
    if (offLine(anchor, next, route[index]) <= BEND_TOLERANCE) continue
    bends.push(route[index])
    anchor = route[index]
  }
  return bends
}

/**
 * How far along one side of a card the engine attached an edge, as the
 * percentage React Flow places a handle by.
 *
 * Only the position along the side is taken from the engine, never the side
 * itself: a route often meets a card at a corner, and reading a side off that
 * would have an edge leave by the face pointing away from where it is going.
 * Which side an edge uses stays a question of where the two cards sit.
 */
function offsetAlong(node, side, point, exact = false) {
  const along = side === 'top' || side === 'bottom'
    ? ((point.x - node.position.x) / NODE_WIDTH) * 100
    : ((point.y - node.position.y) / NODE_HEIGHT) * 100
  if (exact) return along
  return Math.min(94, Math.max(6, along))
}

/**
 * Give every edge a React Flow handle at each end, and the bends between them.
 *
 * Where the layout engine routed the edge, both come from that route: the edge
 * leaves and arrives exactly where the engine attached it, so the lane it
 * reserved between the cards is the lane the line actually takes. Where nothing
 * routed it -- the hand-placed mapping canvas, the focused view -- the edges on
 * a side are fanned across it in the order of the cards they reach, which at
 * least keeps them from crossing on their way out.
 */
function attachHandles(nodes, edges, direction, routes = new Map(), engine = 'dagre') {
  const nodeById = new Map(nodes.map((item) => [item.id, item]))
  const strictElk = engine === 'elk'

  // Fan whatever the engine did not route across the side it uses, in the
  // order of the cards at the other end.
  const bySide = new Map(nodes.map((item) => [item.id, new Map()]))
  const sideKey = (nodeId, side) => {
    const sides = bySide.get(nodeId)
    if (!sides) return null
    if (!sides.has(side)) sides.set(side, [])
    return sides.get(side)
  }
  const alongSide = (side, other) => (
    side === 'top' || side === 'bottom'
      ? other.position.x + NODE_WIDTH / 2
      : other.position.y + NODE_HEIGHT / 2
  )

  const routed = (item) => {
    const route = routes.get(item.id)
    return (!strictElk && item.source === item.target) || !route || route.length < 2 ? null : route
  }

  const fanned = new Map()
  for (const item of [...edges].sort((left, right) => left.id.localeCompare(right.id))) {
    const selfLoop = item.source === item.target
    const sourceNode = nodeById.get(item.source)
    const targetNode = nodeById.get(item.target)
    const [sourceSide, targetSide] = strictElk
      ? elkPortSides(item, direction).map((side) => REACT_FLOW_SIDE[side])
      : selfLoop
        ? ['right', 'right']
        : edgeSides(sourceNode, targetNode, direction)
    fanned.set(item.id, { sourceSide, targetSide, selfLoop })
    if (selfLoop || routed(item) || !sourceNode || !targetNode) continue
    sideKey(item.source, sourceSide)?.push({ id: item.id, along: alongSide(sourceSide, targetNode) })
    sideKey(item.target, targetSide)?.push({ id: item.id, along: alongSide(targetSide, sourceNode) })
  }
  for (const sides of bySide.values()) {
    for (const [side, items] of sides) {
      items.sort((left, right) => left.along - right.along || left.id.localeCompare(right.id))
      sides.set(side, items.map((item) => item.id))
    }
  }

  const nodeHandles = new Map(nodes.map((item) => [item.id, { sourceHandles: [], targetHandles: [] }]))
  const handledEdges = edges.map((item) => {
    const { sourceSide, targetSide, selfLoop } = fanned.get(item.id)
    const spread = (nodeId, side, edgeId) => {
      const items = bySide.get(nodeId)?.get(side) || []
      return ((items.indexOf(edgeId) + 1) / (items.length + 1)) * 100
    }
    const route = routed(item)
    const placed = {
      sourceOffset: route
        ? offsetAlong(nodeById.get(item.source), sourceSide, route[0], strictElk)
        : selfLoop ? 34 : spread(item.source, sourceSide, item.id),
      targetOffset: route
        ? offsetAlong(nodeById.get(item.target), targetSide, route[route.length - 1], strictElk)
        : selfLoop ? 72 : spread(item.target, targetSide, item.id),
    }
    const sourceHandle = `source:${item.id}`
    const targetHandle = `target:${item.id}`
    nodeHandles.get(item.source)?.sourceHandles.push({
      id: sourceHandle,
      position: sourceSide,
      offset: placed.sourceOffset,
    })
    nodeHandles.get(item.target)?.targetHandles.push({
      id: targetHandle,
      position: targetSide,
      offset: placed.targetOffset,
    })
    return {
      ...item,
      // Every routed ELK edge uses the renderer that consumes its exact
      // section. Built-in React Flow edge types would calculate a new route.
      type: route && strictElk ? 'relationshipEdge' : selfLoop ? 'default' : item.type,
      sourceHandle,
      targetHandle,
      data: {
        ...item.data,
        // ELK routes include their exact start and end points. Keep the whole
        // section so rendering never substitutes React Flow's measured (and
        // sometimes fractionally different) endpoint coordinates.
        points: strictElk && route ? route : layoutBends(routes.get(item.id)),
        routeMode: strictElk && route ? 'elk-orthogonal' : undefined,
      },
    }
  })

  return {
    nodes: nodes.map((item) => ({ ...item, data: { ...item.data, ...nodeHandles.get(item.id) } })),
    edges: spreadLabels(handledEdges),
  }
}

/**
 * Set down the labels of edges joining the same two cards at different points
 * along them.
 *
 * A model that spells both directions of a relationship out -- `has_x` on one
 * concept, `x_belongs_to` on the other -- gives the engine two edges to route,
 * and it does route them down their own lanes. Their labels would still both
 * sit at the middle of a run of the same length between the same two cards,
 * which puts two long names on top of each other. Where along the run each
 * label sits is measured from the same end of the pair, or the two directions
 * mirror back onto the same spot.
 */
function spreadLabels(edges) {
  const pairs = new Map()
  for (const item of edges) {
    if (item.source === item.target) continue
    const key = [item.source, item.target].sort().join('\u0000')
    pairs.set(key, [...(pairs.get(key) || []), item.id])
  }

  const places = new Map()
  for (const [key, ids] of pairs) {
    if (ids.length < 2) continue
    const [first] = key.split('\u0000')
    ;[...ids].sort().forEach((id, index) => places.set(id, { index, count: ids.length, first }))
  }
  if (!places.size) return edges

  return edges.map((item) => {
    const place = places.get(item.id)
    if (!place) return item
    const along = (place.index + 1) / (place.count + 1)
    const labelFraction = item.source === place.first ? along : 1 - along
    // Spacing them along the run is not enough on its own: relationship names
    // are long, and two of them a third of a short run apart still overlap. One
    // goes above the line, or left of it, and the next one the other way.
    const labelSide = place.index % 2 === 0 ? -1 : 1
    return { ...item, data: { ...item.data, labelFraction, labelSide } }
  })
}

/**
 * Run layout and attach handles. Supports both Dagre (sync) and ELK (async).
 * Returns a plain object when using Dagre, or a Promise when using ELK.
 *
 * A positioner hands back the cards it placed and, where it has one, the route
 * it worked out for each edge.
 */
function graphResult(nodes, edges, direction, positioner = layout, engine = 'dagre') {
  const attach = (laid) => attachHandles(laid.nodes, edges, direction, laid.routes, engine)
  if (engine === 'elk') return elkLayoutAll(nodes, edges, direction).then(attach)
  return attach(positioner(nodes, edges, direction))
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
        // Concepts use their description as the second line on the node.
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
    return elkLayoutAll(nodes, edges, 'LR').then((laid) => attachHandles(laid.nodes, edges, 'LR', laid.routes, 'elk'))
  }
  // The mapping canvas is three fixed columns, placed by hand; nothing routes
  // its edges, and with that little on screen nothing needs to.
  return attachHandles(layoutMapping(nodes), edges, 'LR')
}
