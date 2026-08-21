import { describe, expect, it } from 'vitest'
import { buildOntologyGraph, buildSemanticGraph, markerSizeForZoom, NODE_HEIGHT, NODE_WIDTH, routeEdgePoints } from './graph'
import { normalizeOssie } from './ossie'

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
  it('leaves an edge alone when nothing stands in its way', () => {
    const clear = { id: 'elsewhere', x: 900, y: 900, width: NODE_WIDTH, height: NODE_HEIGHT }
    expect(routeEdgePoints({ x: 0, y: 0 }, { x: 40, y: 400 }, [clear])).toEqual([])
  })

  it('walks around a card that sits in the way', () => {
    const blocking = { id: 'blocking', x: 0, y: 180, width: NODE_WIDTH, height: NODE_HEIGHT }
    const from = { x: 120, y: 0 }
    const to = { x: 90, y: 460 }
    expect(hitsBox(from, to, blocking)).toBe(true)

    const points = routeEdgePoints(from, to, [blocking])
    expect(points.length).toBeGreaterThan(0)
    expect(pathHitsBox([from, ...points, to], blocking)).toBe(false)
  })

  it('walks around several cards at once', () => {
    const first = { id: 'first', x: 0, y: 160, width: NODE_WIDTH, height: NODE_HEIGHT }
    const second = { id: 'second', x: -180, y: 320, width: NODE_WIDTH, height: NODE_HEIGHT }
    const from = { x: 120, y: 0 }
    const to = { x: -120, y: 560 }

    const points = routeEdgePoints(from, to, [first, second])
    const path = [from, ...points, to]
    expect(pathHitsBox(path, first)).toBe(false)
    expect(pathHitsBox(path, second)).toBe(false)
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

  it('orders the handles on a side by where their edges are going', () => {
    const byId = new Map(ontologyGraph.nodes.map((item) => [item.id, item]))
    for (const node of ontologyGraph.nodes) {
      for (const side of ['top', 'bottom', 'left', 'right']) {
        const handles = [
          ...node.data.sourceHandles.map((handle) => ({ ...handle, role: 'source' })),
          ...node.data.targetHandles.map((handle) => ({ ...handle, role: 'target' })),
        ].filter((handle) => handle.position === side)
        if (handles.length < 2) continue

        // Reading along the side, the nodes at the far ends come in the same
        // order -- which is what stops one node's edges crossing each other.
        const reached = handles
          .sort((left, right) => left.offset - right.offset)
          .map((handle) => {
            const edge = ontologyGraph.edges.find((item) =>
              (handle.role === 'source' ? item.sourceHandle : item.targetHandle) === handle.id)
            const other = byId.get(handle.role === 'source' ? edge.target : edge.source)
            return side === 'top' || side === 'bottom'
              ? other.position.x + NODE_WIDTH / 2
              : other.position.y + NODE_HEIGHT / 2
          })
        expect(reached).toEqual([...reached].sort((left, right) => left - right))
      }
    }
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
