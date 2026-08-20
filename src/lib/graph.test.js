import { describe, expect, it } from 'vitest'
import { NODE_HEIGHT, NODE_WIDTH, buildMappingGraph, buildOntologyGraph, buildSemanticGraph } from './graph'
import { normalizeOssie } from './ossie'

const document = {
  version: '0.2.0.dev0',
  name: 'test',
  ontology: [
    {
      concept: 'party',
      type: 'EntityType',
      relationships: [
        { name: 'owns', roles: [{ concept: 'account' }], verbalizes: ['{party} owns {account}'] },
        { name: 'net_worth', roles: [{ concept: 'money' }], verbalizes: ['{party} is worth {money}'] },
        { name: 'label', roles: [{ concept: 'String' }], verbalizes: ['{party} is called {String}'] },
      ],
    },
    { concept: 'customer', type: 'EntityType', extends: ['party'] },
    { concept: 'account', type: 'EntityType' },
    { concept: 'money', type: 'ValueType', extends: ['Decimal'] },
  ],
  ontology_mappings: [
    {
      name: 'mapping',
      semantic_model: {
        name: 'model',
        datasets: [
          { name: 'parties', source: 'x.parties', fields: [{ name: 'id', expression: 'id' }] },
          { name: 'accounts', source: 'x.accounts', fields: [{ name: 'party_id', expression: 'party_id' }] },
        ],
        relationships: [
          { name: 'account_party', from: 'accounts', to: 'parties', from_columns: ['party_id'], to_columns: ['id'] },
        ],
        metrics: [{ name: 'party_count', expression: 'COUNT(DISTINCT parties.id)' }],
      },
      concept_mappings: [{ concept: 'party', object_mappings: [{ expression: 'parties.id' }] }],
    },
  ],
}

describe('graph builders', () => {
  const model = normalizeOssie(document)

  it('draws entity types only, so attributes stay off the canvas', () => {
    const graph = buildOntologyGraph(model, { showRelationships: true })
    expect(graph.nodes.map((node) => node.id)).not.toContain('money')
    // `party.net_worth -> money` and `party.label -> String` are attributes of
    // party, not links between entities.
    expect(graph.edges.map((edge) => edge.id)).toEqual(
      expect.not.arrayContaining(['relation:party:money', 'relation:party:String']),
    )
    expect(graph.edges.map((edge) => edge.id)).toContain('relation:party:account')
  })

  it('keeps the ontology graph compact until object relationships are enabled', () => {
    const compact = buildOntologyGraph(model)
    expect(compact.edges.map((edge) => edge.data.kind)).toEqual(['inheritance'])
    expect(compact.edges[0].data.selection).toMatchObject({ kind: 'inheritance' })
    const expanded = buildOntologyGraph(model, { showRelationships: true })
    expect(expanded.edges.map((edge) => edge.data.kind)).toContain('relationship')
    expect(expanded.edges.find((edge) => edge.data.kind === 'relationship').data.selection).toMatchObject({
      kind: 'relationship',
      name: 'party.owns',
    })
  })

  it('bundles parallel ontology relationships without losing their identities', () => {
    const parallelDocument = structuredClone(document)
    parallelDocument.ontology[0].relationships.push({
      name: 'manages',
      roles: [{ concept: 'account' }],
      verbalizes: ['{party} manages {account}'],
    })
    const graph = buildOntologyGraph(normalizeOssie(parallelDocument), { showRelationships: true })
    const bundle = graph.edges.find((edge) => edge.data.kind === 'relationship')
    expect(bundle.data.selection.kind).toBe('relationshipGroup')
    expect(bundle.data.relationPaths).toEqual(['party.owns', 'party.manages'])
  })

  it('builds semantic dataset and metric nodes', () => {
    const graph = buildSemanticGraph(model, { showMetrics: true })
    expect(graph.nodes.map((node) => node.id)).toContain('metric:party_count')
    expect(graph.edges.map((edge) => edge.data.kind)).toContain('semantic')
    expect(graph.edges.map((edge) => edge.data.kind)).toContain('metric')
    expect(graph.edges.find((edge) => edge.data.kind === 'semantic').data.selection.kind).toBe('semanticRelationship')
    expect(graph.edges.find((edge) => edge.data.kind === 'metric').data.selection.kind).toBe('metricDependency')
  })

  it('keeps a selected metric visible even when the metric layer is collapsed', () => {
    const graph = buildSemanticGraph(model, {
      showMetrics: false,
      selectedName: 'metric:party_count',
      depth: 1,
    })
    expect(graph.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining(['parties', 'metric:party_count']),
    )
  })

  it('traces concept mappings to referenced datasets', () => {
    const graph = buildMappingGraph(model, model.conceptMappings[0])
    expect(graph.nodes.map((node) => node.id)).toEqual([
      'concept:party',
      'mapping:party',
      'dataset:parties',
    ])
    expect(graph.edges.every((edge) => edge.data.selection.kind === 'mappingEvidence')).toBe(true)
    const datasetEdge = graph.edges.find((edge) => edge.id === 'mapping-dataset:party:parties')
    expect(datasetEdge).toMatchObject({ type: 'relationshipEdge', interactionWidth: 7 })
    expect(datasetEdge.data.selection).toMatchObject({
      name: 'party → parties',
      target: {
        type: 'dataset-mapping',
        evidence: {
          dataset: 'parties',
          expressions: ['parties.id'],
          fragmentCount: 1,
        },
      },
    })
  })

  it('lays out nodes without bounding-box collisions', () => {
    const graph = buildOntologyGraph(model, { showRelationships: true })
    for (let leftIndex = 0; leftIndex < graph.nodes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < graph.nodes.length; rightIndex += 1) {
        const left = graph.nodes[leftIndex].position
        const right = graph.nodes[rightIndex].position
        const overlaps = left.x < right.x + NODE_WIDTH
          && left.x + NODE_WIDTH > right.x
          && left.y < right.y + NODE_HEIGHT
          && left.y + NODE_HEIGHT > right.y
        expect(overlaps, `${graph.nodes[leftIndex].id} overlaps ${graph.nodes[rightIndex].id}`).toBe(false)
      }
    }
  })

  it('uses a compact, collision-free grid for a focused ontology neighborhood', () => {
    const graph = buildOntologyGraph(model, {
      showRelationships: true,
      selectedName: 'party',
      depth: 1,
    })
    expect(graph.nodes.find((node) => node.id === 'party').position.y).toBe(0)
    for (let leftIndex = 0; leftIndex < graph.nodes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < graph.nodes.length; rightIndex += 1) {
        const left = graph.nodes[leftIndex].position
        const right = graph.nodes[rightIndex].position
        const overlaps = left.x < right.x + NODE_WIDTH
          && left.x + NODE_WIDTH > right.x
          && left.y < right.y + NODE_HEIGHT
          && left.y + NODE_HEIGHT > right.y
        expect(overlaps).toBe(false)
      }
    }
  })
})
