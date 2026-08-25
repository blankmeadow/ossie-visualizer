import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { elkOrthogonalPath } from './edgePath'
import {
  buildMappingGraph,
  buildOntologyGraph,
  buildSemanticGraph,
  edgeRouteAfterMove,
  layoutBends,
  markerSizeForZoom,
  movedHandleOverrides,
} from './graph'
import {
  declarativeHandle,
  HANDLE_OUTSET,
  HANDLE_SIZE,
  NODE_HEIGHT,
  NODE_WIDTH,
} from './graphGeometry'
import { normalizeOssie, parseOssie } from './ossie'

/**
 * Layout conventions the graph views are expected to honour:
 *
 *   1. Inheritance reads top-down: a parent concept always sits above the
 *      concepts that extend it, even though the arrow points child -> parent.
 *   2. A node's edges never leave from the side facing away from the other
 *      end, so for any node the relationships it owns and the relationships
 *      pointing at it land on opposite sides.
 *
 * These are easy to break by changing an edge's source/target or the rank
 * direction, and the breakage is only visible on screen, so they are asserted
 * here rather than left to review.
 */

const document = {
  version: '0.2.0.dev0',
  name: 'layout',
  ontology: [
    {
      concept: 'party',
      type: 'EntityType',
      description: 'Root of the hierarchy.',
      relationships: [
        { name: 'party_name', roles: [{ concept: 'String' }], verbalizes: ['{party} has name {String}'] },
        // party sits a rank above customer, which sits a rank above order, so
        // this one has to cross a rank to get there.
        { name: 'party_order', roles: [{ concept: 'order' }], verbalizes: ['{party} raises {order}'] },
      ],
    },
    {
      concept: 'customer',
      type: 'EntityType',
      extends: ['party'],
      relationships: [
        { name: 'places', roles: [{ concept: 'order' }], verbalizes: ['{customer} places {order}'] },
      ],
    },
    { concept: 'supplier', type: 'EntityType', extends: ['party'] },
    {
      concept: 'order',
      type: 'EntityType',
      relationships: [
        { name: 'totals', roles: [{ concept: 'money' }], verbalizes: ['{order} totals {money}'] },
      ],
    },
    { concept: 'money', type: 'ValueType', extends: ['Decimal'] },
  ],
  ontology_mappings: [
    {
      name: 'mapping',
      semantic_model: {
        name: 'model',
        datasets: [
          { name: 'customers', source: 'x.customers', description: 'Customer dimension.', fields: [{ name: 'id', expression: 'id' }] },
          { name: 'orders', source: 'x.orders', description: 'Order facts.', fields: [{ name: 'customer_id', expression: 'customer_id' }] },
        ],
        relationships: [{ name: 'orders_customers', from: 'orders', to: 'customers' }],
        metrics: [],
      },
      concept_mappings: [{ concept: 'customer', object_mappings: [{ expression: 'customers.id' }] }],
    },
  ],
}

const model = normalizeOssie(document)

/** Every edge's endpoints, paired with the handle each end actually uses. */
function endpoints(graph) {
  const byId = new Map(graph.nodes.map((item) => [item.id, item]))
  return graph.edges.map((item) => {
    const source = byId.get(item.source)
    const target = byId.get(item.target)
    const find = (node, list, prefix) =>
      (node.data[list] || []).find((handle) => handle.id === `${prefix}:${item.id}`)
    return {
      id: item.id,
      kind: item.data.kind,
      source,
      target,
      sourceSide: find(source, 'sourceHandles', 'source')?.position,
      targetSide: find(target, 'targetHandles', 'target')?.position,
    }
  })
}

const ontologyGraph = buildOntologyGraph(model, { showRelationships: true })
const elkOntologyGraph = await buildOntologyGraph(model, { showRelationships: true, layoutEngine: 'elk' })
const routingStressModel = normalizeOssie({
  version: '0.2.0.dev0',
  name: 'elk-routing-stress',
  ontology: [
    {
      concept: 'person',
      type: 'EntityType',
      relationships: [{ name: 'owns', roles: [{ concept: 'car' }], verbalizes: ['{person} owns {car}'] }],
    },
    { concept: 'employee', type: 'EntityType', extends: ['person'] },
    {
      concept: 'car',
      type: 'EntityType',
      relationships: [{ name: 'driver', roles: [{ concept: 'person' }], verbalizes: ['{car} has driver {person}'] }],
    },
    {
      concept: 'loop',
      type: 'EntityType',
      relationships: [{ name: 'self', roles: [{ concept: 'loop' }], verbalizes: ['{loop} links {loop}'] }],
    },
    {
      concept: 'island_a',
      type: 'EntityType',
      relationships: [{ name: 'next', roles: [{ concept: 'island_b' }], verbalizes: ['{island_a} links {island_b}'] }],
    },
    { concept: 'island_b', type: 'EntityType' },
  ],
  ontology_mappings: [],
})
const elkRoutingStressGraph = await buildOntologyGraph(routingStressModel, {
  showRelationships: true,
  layoutEngine: 'elk',
})
const layoutStressDocument = parseOssie(
  readFileSync(new URL('./__fixtures__/layout-stress.ossie.yaml', import.meta.url), 'utf8'),
)
if (layoutStressDocument.errors.length) {
  throw new Error(`Invalid layout stress fixture: ${JSON.stringify(layoutStressDocument.errors)}`)
}
const layoutStressModel = normalizeOssie(layoutStressDocument.document)
const elkLayoutStressGraph = await buildOntologyGraph(layoutStressModel, {
  showRelationships: true,
  layoutEngine: 'elk',
})

/** The groups of cards with nothing joining one group to the next. */
function disconnectedParts(graph) {
  const adjacency = new Map(graph.nodes.map((item) => [item.id, new Set()]))
  for (const item of graph.edges) {
    adjacency.get(item.source)?.add(item.target)
    adjacency.get(item.target)?.add(item.source)
  }
  const seen = new Set()
  const parts = []
  for (const item of graph.nodes) {
    if (seen.has(item.id)) continue
    const ids = [item.id]
    seen.add(item.id)
    for (let index = 0; index < ids.length; index++) {
      for (const neighbor of adjacency.get(ids[index]) || []) {
        if (seen.has(neighbor)) continue
        seen.add(neighbor)
        ids.push(neighbor)
      }
    }
    parts.push(ids)
  }
  return parts
}

/** What a group of cards takes up on the canvas, routes included. */
function partBounds(graph, ids) {
  const held = new Set(ids)
  const byId = new Map(graph.nodes.map((item) => [item.id, item]))
  const points = [
    ...ids.flatMap((id) => {
      const { x, y } = byId.get(id).position
      return [{ x, y }, { x: x + NODE_WIDTH, y: y + NODE_HEIGHT }]
    }),
    ...graph.edges
      .filter((item) => held.has(item.source))
      .flatMap((item) => item.data.points || []),
  ]
  return {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
  }
}

describe('graph layout conventions', () => {
  const ontology = ontologyGraph

  it('ranks a parent concept above every concept that extends it', () => {
    const byId = new Map(ontology.nodes.map((item) => [item.id, item]))
    const inheritance = ontology.edges.filter((item) => item.data.kind === 'inheritance')
    expect(inheritance.length).toBeGreaterThan(0)

    for (const item of inheritance) {
      const child = byId.get(item.source)
      const parent = byId.get(item.target)
      // The arrow still points child -> parent, per the UML convention.
      expect(item.source).not.toBe(item.target)
      expect(parent.position.y).toBeLessThan(child.position.y)
    }
  })

  it('points every handle toward the node at the other end of the edge', () => {
    let checked = 0
    for (const item of endpoints(ontology)) {
      if (item.source.id === item.target.id) continue
      if (item.source.position.y === item.target.position.y) continue
      const downward = item.target.position.y > item.source.position.y
      expect(
        { id: item.id, sourceSide: item.sourceSide, targetSide: item.targetSide },
      ).toEqual({
        id: item.id,
        sourceSide: downward ? 'bottom' : 'top',
        targetSide: downward ? 'top' : 'bottom',
      })
      checked += 1
    }
    // Guard against the loop skipping everything and passing vacuously.
    expect(checked).toBeGreaterThanOrEqual(3)
  })

  it('separates what a concept points at from what points at it', () => {
    // `customer` extends party (upward) and owns `places -> order` (downward),
    // so its two edges must not share a side.
    const customerEdges = endpoints(ontology).filter(
      (item) => item.source.id === 'customer' || item.target.id === 'customer',
    )
    const sides = customerEdges.map((item) =>
      item.source.id === 'customer' ? item.sourceSide : item.targetSide,
    )
    expect(sides).toContain('top')
    expect(sides).toContain('bottom')
  })

  it('lays the semantic graph out top-down as well', () => {
    const semantic = buildSemanticGraph(model, { showMetrics: false })
    for (const item of endpoints(semantic)) {
      expect(['top', 'bottom']).toContain(item.sourceSide)
      expect(['top', 'bottom']).toContain(item.targetSide)
    }
  })

  it('carries the description onto concept and dataset nodes', () => {
    const party = ontology.nodes.find((item) => item.id === 'party')
    expect(party.data.description).toBe('Root of the hierarchy.')
    // The header already names the kind, so the subtitle must not repeat it.
    expect(party.data.subtitle).toBe('')

    const semantic = buildSemanticGraph(model, { showMetrics: false })
    const customers = semantic.nodes.find((item) => item.id === 'customers')
    expect(customers.data.description).toBe('Customer dimension.')
    // A dataset keeps its physical source, which the description no longer hides.
    expect(customers.data.subtitle).toBe('x.customers')
  })
})

describe('focused ontology layout', () => {
  const topNodeIds = (graph) => {
    const top = Math.min(...graph.nodes.map((item) => item.position.y))
    return graph.nodes
      .filter((item) => Math.abs(item.position.y - top) < 1e-6)
      .map((item) => item.id)
      .sort()
  }

  it.each([false, true])(
    'keeps the selected node alone on the first layer with relationships=%s',
    async (showRelationships) => {
      const options = {
        showRelationships,
        selectedName: 'Customer',
        depth: 1,
      }
      const dagre = buildOntologyGraph(layoutStressModel, options)
      const elk = await buildOntologyGraph(layoutStressModel, { ...options, layoutEngine: 'elk' })

      expect(elk.nodes.map((item) => item.id).sort())
        .toEqual(dagre.nodes.map((item) => item.id).sort())
      expect(elk.nodes).toHaveLength(4)
      expect(topNodeIds(dagre)).toEqual(['Customer'])
      expect(topNodeIds(elk)).toEqual(['Customer'])

      for (const item of endpoints(elk)) {
        const edge = elk.edges.find((candidate) => candidate.id === item.id)
        expect(edge.data.routeMode).toBe('elk-orthogonal')
        const points = edge.data.points || []
        for (let index = 1; index < points.length; index++) {
          const from = points[index - 1]
          const to = points[index]
          expect(
            Math.abs(from.x - to.x) < 1e-6 || Math.abs(from.y - to.y) < 1e-6,
            `${item.id}: ${JSON.stringify([from, to])}`,
          ).toBe(true)
        }
        if (item.source.id === item.target.id) continue
        const downward = item.target.position.y > item.source.position.y
        expect(
          { sourceSide: item.sourceSide, targetSide: item.targetSide },
          item.id,
        ).toEqual({
          sourceSide: downward ? 'bottom' : 'top',
          targetSide: downward ? 'top' : 'bottom',
        })
      }

      const childToParent = endpoints(elk)
        .find((item) => item.id === 'extends:Customer:Party')
      expect(childToParent.sourceSide).toBe('bottom')
      expect(childToParent.targetSide).toBe('top')
      expect(
        elk.edges.find((item) => item.id === childToParent.id).data.points.length,
      ).toBeLessThanOrEqual(4)
      const childIntoRoot = endpoints(elk)
        .find((item) => item.id === 'extends:VipCustomer:Customer')
      expect(childIntoRoot.sourceSide).toBe('top')
      expect(childIntoRoot.targetSide).toBe('bottom')
    },
  )
})

describe('declarative React Flow handles', () => {
  it.each([
    ['top', { x: NODE_WIDTH * 0.25, y: -HANDLE_OUTSET }],
    ['right', { x: NODE_WIDTH + HANDLE_OUTSET, y: NODE_HEIGHT * 0.25 }],
    ['bottom', { x: NODE_WIDTH * 0.25, y: NODE_HEIGHT + HANDLE_OUTSET }],
    ['left', { x: -HANDLE_OUTSET, y: NODE_HEIGHT * 0.25 }],
  ])('puts the %s anchor on the handle outer rim', (position, expected) => {
    const handle = declarativeHandle({ id: `source:${position}`, position, offset: 25 }, 'source')
    const anchor = position === 'top'
      ? { x: handle.x + handle.width / 2, y: handle.y }
      : position === 'right'
        ? { x: handle.x + handle.width, y: handle.y + handle.height / 2 }
        : position === 'bottom'
          ? { x: handle.x + handle.width / 2, y: handle.y + handle.height }
          : { x: handle.x, y: handle.y + handle.height / 2 }

    expect(handle).toMatchObject({
      id: `source:${position}`,
      type: 'source',
      position,
      width: HANDLE_SIZE,
      height: HANDLE_SIZE,
    })
    expect(anchor.x).toBeCloseTo(expected.x)
    expect(anchor.y).toBeCloseTo(expected.y)
  })
})

/** Does the straight run from `from` to `to` pass through `box`? */
function hitsBox(from, to, box) {
  const steps = 200
  for (let index = 0; index <= steps; index++) {
    const ratio = index / steps
    const x = from.x + (to.x - from.x) * ratio
    const y = from.y + (to.y - from.y) * ratio
    if (x > box.x && x < box.x + box.width && y > box.y && y < box.y + box.height) return true
  }
  return false
}

function pathHitsBox(points, box) {
  return points.slice(1).some((point, index) => hitsBox(points[index], point, box))
}

describe('edge routing', () => {
  it('takes the route the layout engine worked out for an edge that crosses a rank', () => {
    // party -> order steps over the rank customer and supplier are on, and the
    // engine reserves a lane for it there. Those are the bends worth drawing.
    const crossing = ontologyGraph.edges.find((item) => item.id === 'relation:party:order')
    expect(crossing).toBeDefined()
    expect(crossing.data.points.length).toBeGreaterThan(0)
  })

  it('keeps only the bends in a route that change its direction', () => {
    // A route arrives as one point per rank crossed, most of them in a straight
    // run down a reserved lane. Drawing every one of them says no more than
    // drawing the two that turn.
    const straightRun = [{ x: 0, y: 0 }, { x: 0, y: 60 }, { x: 0, y: 120 }, { x: 0, y: 180 }]
    expect(layoutBends(straightRun)).toEqual([])

    const aroundACard = [
      { x: 0, y: 0 },
      { x: 300, y: 60 },
      { x: 300, y: 120 },
      { x: 300, y: 180 },
      { x: 0, y: 240 },
    ]
    expect(layoutBends(aroundACard)).toEqual([{ x: 300, y: 60 }, { x: 300, y: 180 }])

    expect(layoutBends([{ x: 0, y: 0 }, { x: 10, y: 90 }])).toEqual([])
    expect(layoutBends(undefined)).toEqual([])
  })

  it('keeps the drawn ontology off the cards an edge is not attached to', () => {
    const byId = new Map(ontologyGraph.nodes.map((item) => [item.id, item]))
    const boxes = new Map(ontologyGraph.nodes.map((item) => [item.id, {
      id: item.id,
      x: item.position.x,
      y: item.position.y,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    }]))
    // Where React Flow will actually draw the end of an edge: the handle's
    // side, at its offset along it.
    const endpoint = (nodeId, handleId, role) => {
      const node = byId.get(nodeId)
      const handle = node.data[role === 'source' ? 'sourceHandles' : 'targetHandles']
        .find((item) => item.id === handleId)
      if (!handle) return null
      const { x, y } = node.position
      if (handle.position === 'top') return { x: x + (NODE_WIDTH * handle.offset) / 100, y }
      if (handle.position === 'bottom') return { x: x + (NODE_WIDTH * handle.offset) / 100, y: y + NODE_HEIGHT }
      if (handle.position === 'left') return { x, y: y + (NODE_HEIGHT * handle.offset) / 100 }
      return { x: x + NODE_WIDTH, y: y + (NODE_HEIGHT * handle.offset) / 100 }
    }

    let checked = 0
    for (const item of ontologyGraph.edges) {
      if (item.source === item.target) continue
      const from = endpoint(item.source, item.sourceHandle, 'source')
      const to = endpoint(item.target, item.targetHandle, 'target')
      if (!from || !to) continue
      checked += 1
      const path = [from, ...(item.data.points || []), to]
      for (const box of boxes.values()) {
        if (box.id === item.source || box.id === item.target) continue
        expect({ edge: item.id, node: box.id, through: pathHitsBox(path, box) })
          .toEqual({ edge: item.id, node: box.id, through: false })
      }
    }
    expect(checked).toBeGreaterThanOrEqual(3)
  })

  it('puts each handle where the engine attached the route', () => {
    const byId = new Map(ontologyGraph.nodes.map((item) => [item.id, item]))
    let checked = 0
    for (const item of ontologyGraph.edges) {
      const bends = item.data.points || []
      if (!bends.length) continue
      const source = byId.get(item.source)
      const target = byId.get(item.target)
      const leaves = source.data.sourceHandles.find((handle) => handle.id === item.sourceHandle)
      const arrives = target.data.targetHandles.find((handle) => handle.id === item.targetHandle)
      // The first bend is the route's own next step after leaving the card, so
      // the handle it leaves by has to be the end of the side nearest to it.
      for (const [node, handle, bend] of [
        [source, leaves, bends[0]],
        [target, arrives, bends[bends.length - 1]],
      ]) {
        expect(['top', 'bottom']).toContain(handle.position)
        const handleX = node.position.x + (NODE_WIDTH * handle.offset) / 100
        const towards = Math.sign(bend.x - (node.position.x + NODE_WIDTH / 2))
        // A route heading off to one side leaves from that half of the card.
        if (Math.abs(bend.x - (node.position.x + NODE_WIDTH / 2)) < NODE_WIDTH) continue
        expect(Math.sign(handleX - (node.position.x + NODE_WIDTH / 2)) || towards).toBe(towards)
        checked += 1
      }
    }
    expect(checked).toBeGreaterThanOrEqual(1)
  })
})

describe('strict ELK routing', () => {
  const byId = new Map(elkOntologyGraph.nodes.map((item) => [item.id, item]))
  const outward = {
    top: [0, -1],
    right: [1, 0],
    bottom: [0, 1],
    left: [-1, 0],
  }

  const endpoint = (nodeId, handleId, role, outerRim = true) => {
    const node = byId.get(nodeId)
    const handles = node.data[role === 'source' ? 'sourceHandles' : 'targetHandles']
    const handle = handles.find((item) => item.id === handleId)
    const { x, y } = node.position
    let point
    if (handle.position === 'top') point = { x: x + (NODE_WIDTH * handle.offset) / 100, y }
    else if (handle.position === 'bottom') point = { x: x + (NODE_WIDTH * handle.offset) / 100, y: y + NODE_HEIGHT }
    else if (handle.position === 'left') point = { x, y: y + (NODE_HEIGHT * handle.offset) / 100 }
    else point = { x: x + NODE_WIDTH, y: y + (NODE_HEIGHT * handle.offset) / 100 }
    if (!outerRim) return point
    const [dx, dy] = outward[handle.position]
    // NodeHandle straddles the card border, so React Flow's edge anchor sits
    // one handle radius beyond ELK's port centre.
    return { x: point.x + dx * HANDLE_OUTSET, y: point.y + dy * HANDLE_OUTSET }
  }

  it('ranks inheritance parent-first while keeping the arrow child-to-parent', () => {
    const inheritance = elkOntologyGraph.edges.filter((item) => item.data.kind === 'inheritance')
    expect(inheritance.length).toBeGreaterThan(0)
    for (const item of inheritance) {
      expect(byId.get(item.target).position.y).toBeLessThan(byId.get(item.source).position.y)
      const sourceHandle = byId.get(item.source).data.sourceHandles
        .find((handle) => handle.id === item.sourceHandle)
      const targetHandle = byId.get(item.target).data.targetHandles
        .find((handle) => handle.id === item.targetHandle)
      expect(sourceHandle.position).toBe('top')
      expect(targetHandle.position).toBe('bottom')
    }
  })

  it('uses every ELK section as an unsmoothed, handle-anchored orthogonal route', () => {
    for (const item of elkOntologyGraph.edges) {
      expect(item.type).toBe('relationshipEdge')
      expect(item.data.routeMode).toBe('elk-orthogonal')
      const points = item.data.points || []
      const source = endpoint(item.source, item.sourceHandle, 'source')
      const target = endpoint(item.target, item.targetHandle, 'target')
      const sourcePortCentre = endpoint(item.source, item.sourceHandle, 'source', false)
      const targetPortCentre = endpoint(item.target, item.targetHandle, 'target', false)
      expect(points[0].x).toBeCloseTo(source.x)
      expect(points[0].y).toBeCloseTo(source.y)
      expect(points[points.length - 1].x).toBeCloseTo(target.x)
      expect(points[points.length - 1].y).toBeCloseTo(target.y)
      expect(Math.hypot(points[0].x - sourcePortCentre.x, points[0].y - sourcePortCentre.y))
        .toBeCloseTo(5)
      expect(Math.hypot(
        points[points.length - 1].x - targetPortCentre.x,
        points[points.length - 1].y - targetPortCentre.y,
      )).toBeCloseTo(5)
      for (let index = 1; index < points.length; index++) {
        const from = points[index - 1]
        const to = points[index]
        const orthogonal = Math.abs(from.x - to.x) < 1e-6 || Math.abs(from.y - to.y) < 1e-6
        expect(orthogonal, `${item.id}: ${JSON.stringify([from, to])}`).toBe(true)
      }
    }
  })

  it('draws ELK points verbatim with hard SVG line segments', () => {
    const points = [{ x: 0, y: 0 }, { x: 0, y: 60 }, { x: 100, y: 60 }]
    const [path, labelX, labelY] = elkOrthogonalPath(points, 0.5)
    expect(path).toBe('M 0,0 L 0,60 L 100,60')
    expect(path).not.toMatch(/[CQ]/)
    expect([labelX, labelY]).toEqual([20, 60])
  })

  it('uses the exact ELK renderer in the semantic and mapping views too', async () => {
    const graphs = [
      await buildSemanticGraph(model, { layoutEngine: 'elk' }),
      await buildMappingGraph(model, model.conceptMappings[0], { layoutEngine: 'elk' }),
    ]
    for (const graph of graphs) {
      expect(graph.edges.length).toBeGreaterThan(0)
      for (const item of graph.edges) {
        expect(item.type).toBe('relationshipEdge')
        expect(item.data.routeMode).toBe('elk-orthogonal')
        expect(item.data.points.length).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('packs back-edge and self-loop lanes inside their component bounds', () => {
    for (const item of elkRoutingStressGraph.edges) {
      for (const point of item.data.points || []) {
        expect(point.x, `${item.id} has a negative x route coordinate`).toBeGreaterThanOrEqual(0)
        expect(point.y, `${item.id} has a negative y route coordinate`).toBeGreaterThanOrEqual(0)
      }
    }

    const boxes = elkRoutingStressGraph.nodes.map((item) => ({
      id: item.id,
      x: item.position.x,
      y: item.position.y,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    }))
    for (const item of elkRoutingStressGraph.edges) {
      for (const box of boxes) {
        if (box.id === item.source || box.id === item.target) continue
        expect(
          pathHitsBox(item.data.points || [], box),
          `${item.id} crosses disconnected node ${box.id}`,
        ).toBe(false)
      }
    }
  })

  it('keeps an invalidated ELK self-loop on the live orthogonal renderer', () => {
    const selfLoop = elkRoutingStressGraph.edges.find((item) => item.source === 'loop' && item.target === 'loop')
    expect(selfLoop.type).toBe('relationshipEdge')
    expect(selfLoop.data.routeMode).toBe('elk-orthogonal')
    expect(selfLoop.data.points.length).toBeGreaterThanOrEqual(4)

    const moved = new Set(['loop'])
    expect(edgeRouteAfterMove(selfLoop, moved)).toEqual({
      type: 'relationshipEdge',
      points: undefined,
      routeMode: 'elk-orthogonal',
    })
    const overrides = movedHandleOverrides(
      elkRoutingStressGraph.nodes,
      elkRoutingStressGraph.edges,
      { loop: { x: 500, y: 300 } },
      moved,
    )
    expect(overrides.get(selfLoop.sourceHandle)).toEqual({ position: 'right', offset: 34 })
    expect(overrides.get(selfLoop.targetHandle)).toEqual({ position: 'right', offset: 72 })
  })

  it('keeps a clear lane for every relationship name', () => {
    // Names used to be dropped at the middle of their line, where the layout had
    // not kept any room for them, so on a model with more than a few edges they
    // landed on cards and on each other. ELK is given the box each name needs
    // and hands back where it put it.
    const boxes = elkLayoutStressGraph.edges
      .filter((item) => item.data.label)
      .map((item) => {
        const point = item.data.labelPoint
        expect(point, `${item.id} was drawn without a place for its name`).toBeDefined()
        return {
          id: item.id,
          x: point.x - point.width / 2,
          y: point.y - point.height / 2,
          width: point.width,
          height: point.height,
        }
      })
    expect(boxes.length).toBeGreaterThanOrEqual(8)

    const overlaps = (left, right) => (
      Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x) > 1
      && Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y) > 1
    )
    for (let left = 0; left < boxes.length; left++) {
      for (let right = left + 1; right < boxes.length; right++) {
        expect(
          { pair: [boxes[left].id, boxes[right].id], overlapping: overlaps(boxes[left], boxes[right]) },
        ).toEqual({ pair: [boxes[left].id, boxes[right].id], overlapping: false })
      }
      for (const node of elkLayoutStressGraph.nodes) {
        const card = { x: node.position.x, y: node.position.y, width: NODE_WIDTH, height: NODE_HEIGHT }
        expect(
          { name: boxes[left].id, card: node.id, overlapping: overlaps(boxes[left], card) },
        ).toEqual({ name: boxes[left].id, card: node.id, overlapping: false })
      }
    }
  })

  it('sets the disconnected parts of a model down clear of each other, biggest first', () => {
    // Party's tree, Warehouse/Bin and Region/Zone share no edge, so ELK is left
    // to separate and arrange them. Nothing may land on top of anything else,
    // and the part the reader came for stays the one they meet first.
    const parts = disconnectedParts(elkLayoutStressGraph)
      .sort((left, right) => right.length - left.length)
    expect(parts).toHaveLength(3)

    const bounds = parts.map((ids) => partBounds(elkLayoutStressGraph, ids))
    for (const box of bounds) {
      expect(box.minX).toBeGreaterThanOrEqual(-1)
      expect(box.minY).toBeGreaterThanOrEqual(-1)
    }
    for (let left = 0; left < bounds.length; left++) {
      for (let right = left + 1; right < bounds.length; right++) {
        const overlapX = Math.min(bounds[left].maxX, bounds[right].maxX)
          - Math.max(bounds[left].minX, bounds[right].minX)
        const overlapY = Math.min(bounds[left].maxY, bounds[right].maxY)
          - Math.max(bounds[left].minY, bounds[right].minY)
        expect(
          { parts: [parts[left][0], parts[right][0]], overlapping: overlapX > 1 && overlapY > 1 },
        ).toEqual({ parts: [parts[left][0], parts[right][0]], overlapping: false })
      }
    }
    for (const box of bounds.slice(1)) {
      expect(bounds[0].minX).toBeLessThanOrEqual(box.minX)
    }
  })

  it('leaves each card by the face pointing at the other end, across full and focused layouts', async () => {
    // Port sides used to be worked out before ELK placed the cards, from the
    // rank an edge was given. A back edge in a cycle -- Customer -> Order,
    // Product -> Supplier -- then left by the face pointing away from its own
    // other end, and ELK, forbidden to move the port, could only route it the
    // long way around the card. Sides now come from where ELK attached the
    // route, so this sweep covers the layouts where that used to show.
    const roots = layoutStressModel.concepts
      .filter((item) => item.type !== 'ValueType')
      .map((item) => item.concept)
    const configs = [
      { label: 'full', options: { showRelationships: true } },
      ...roots.flatMap((selectedName) => [1, 2].map((depth) => ({
        label: `focus ${selectedName} at depth ${depth}`,
        options: { showRelationships: true, selectedName, depth },
      }))),
    ]

    let checked = 0
    for (const config of configs) {
      const graph = await buildOntologyGraph(layoutStressModel, {
        ...config.options,
        layoutEngine: 'elk',
      })
      for (const item of endpoints(graph)) {
        const edge = graph.edges.find((candidate) => candidate.id === item.id)
        const points = edge.data.points || []
        for (let index = 1; index < points.length; index++) {
          const from = points[index - 1]
          const to = points[index]
          expect(
            Math.abs(from.x - to.x) < 1e-6 || Math.abs(from.y - to.y) < 1e-6,
            `${config.label}: ${item.id} bends off the orthogonal grid`,
          ).toBe(true)
        }
        if (item.source.id === item.target.id) continue
        if (item.source.position.y === item.target.position.y) continue
        const downward = item.target.position.y > item.source.position.y
        expect(
          { sourceSide: item.sourceSide, targetSide: item.targetSide },
          `${config.label}: ${item.id}`,
        ).toEqual({
          sourceSide: downward ? 'bottom' : 'top',
          targetSide: downward ? 'top' : 'bottom',
        })
        checked += 1
      }
    }
    // Guard against a change to the fixture quietly emptying the sweep.
    expect(checked).toBeGreaterThanOrEqual(50)
  })

  it('turns fallback handles toward the new relative position after a drag', () => {
    const relation = elkRoutingStressGraph.edges.find((item) => item.id === 'relation:person:car')
    const byStressId = new Map(elkRoutingStressGraph.nodes.map((item) => [item.id, item]))
    const person = byStressId.get('person')
    const manualPositions = {
      car: { x: person.position.x, y: person.position.y - NODE_HEIGHT - 100 },
    }
    const moved = new Set(['car'])
    const overrides = movedHandleOverrides(
      elkRoutingStressGraph.nodes,
      elkRoutingStressGraph.edges,
      manualPositions,
      moved,
    )
    expect(edgeRouteAfterMove(relation, moved)).toEqual({
      type: 'relationshipEdge',
      points: undefined,
      routeMode: 'elk-orthogonal',
    })
    expect(overrides.get(relation.sourceHandle)?.position).toBe('top')
    expect(overrides.get(relation.targetHandle)?.position).toBe('bottom')
  })
})

describe('adaptive edge markers', () => {
  it('keeps arrowheads near a stable screen size across zoom levels', () => {
    const regularAtFit = markerSizeForZoom(0.56, 1.1, false)
    const regularAtNative = markerSizeForZoom(1, 1.1, false)
    const highlightedAtFit = markerSizeForZoom(0.56, 1.55, true)

    expect(regularAtFit).toBeGreaterThan(regularAtNative)
    expect(regularAtFit * 0.56 * 1.1).toBeCloseTo(13, 1)
    expect(highlightedAtFit * 0.56 * 1.55).toBeCloseTo(15, 1)
    expect(markerSizeForZoom(0.08, 1.1, false) * 0.08 * 1.1).toBeGreaterThanOrEqual(8.5)
  })
})
