import { describe, expect, it } from 'vitest'
import { buildOntologyGraph, buildSemanticGraph } from './graph'
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
    { concept: 'money', type: 'ValueType' },
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

describe('graph layout conventions', () => {
  const ontology = buildOntologyGraph(model, { showRelationships: true, showValueTypes: true })

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
    expect(checked).toBeGreaterThanOrEqual(4)
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
