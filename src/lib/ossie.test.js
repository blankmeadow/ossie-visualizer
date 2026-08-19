import { describe, expect, it } from 'vitest'
import {
  buildSearchIndex,
  mappingEvidenceForDataset,
  normalizeOssie,
  parseOssie,
  referencedDatasets,
  searchIndex,
  validateOssie,
} from './ossie'

const pureOntology = {
  version: '0.2.0.dev0',
  name: 'party_ontology',
  ontology: [
    {
      concept: 'party',
      type: 'EntityType',
      description: 'A person or organization.',
      relationships: [
        {
          name: 'name',
          roles: [{ concept: 'String' }],
          verbalizes: ['{party} has name {String}'],
        },
      ],
    },
    {
      concept: 'legal_entity',
      type: 'EntityType',
      extends: ['party'],
      description: 'A legally recognized entity.',
    },
  ],
}

const fullDocument = {
  ...pureOntology,
  ontology_mappings: [
    {
      name: 'party_mapping',
      semantic_model: {
        name: 'party_model',
        datasets: [
          {
            name: 'parties',
            source: 'public.parties',
            fields: [{ name: 'name', expression: 'name', datatype: 'String' }],
          },
        ],
        metrics: [
          { name: 'party_count', expression: 'COUNT(DISTINCT parties.name)', datatype: 'Integer' },
        ],
      },
      concept_mappings: [
        {
          concept: 'party',
          object_mappings: [{ expression: 'parties.name' }],
        },
      ],
    },
  ],
}

describe('Ossie parsing and validation', () => {
  it('accepts a pure ontology and reports semantic layers as optional', () => {
    const result = parseOssie(JSON.stringify(pureOntology))
    expect(result.errors).toEqual([])
    expect(result.warnings[0].path).toBe('$.ontology_mappings')
    expect(normalizeOssie(result.document).stats.datasets).toBe(0)
  })

  it('rejects malformed json and dangling concept references', () => {
    expect(parseOssie('{').errors[0].message).toContain('JSON 语法错误')
    const invalid = structuredClone(pureOntology)
    invalid.ontology[1].extends = ['missing_parent']
    expect(validateOssie(invalid).errors).toContainEqual({
      path: '$.ontology[1].extends[0]',
      message: '未知父概念：missing_parent',
    })
  })

  it('normalizes semantic models and finds datasets from mapping expressions', () => {
    const model = normalizeOssie(fullDocument)
    expect(model.stats).toMatchObject({
      entityTypes: 2,
      datasets: 1,
      fields: 1,
      metrics: 1,
      conceptMappings: 1,
    })
    expect(referencedDatasets(model.conceptMappings[0], new Set(['parties']))).toEqual(['parties'])
  })

  it('keeps dataset mapping evidence scoped to the clicked edge', () => {
    const mapping = {
      concept: 'party',
      object_mappings: [
        { expression: 'parties.name' },
        { expression: 'accounts.party_id' },
      ],
      link_mappings: [
        {
          object_mapping: { expression: 'parties.name' },
          children: [
            { object_mapping: { expression: 'parties.status', concept: 'String' }, relationship: 'status' },
          ],
        },
        {
          object_mapping: { expression: 'accounts.party_id' },
          children: [
            { object_mapping: { expression: 'accounts.id', concept: 'String' }, relationship: 'account_id' },
          ],
        },
      ],
    }
    const evidence = mappingEvidenceForDataset(mapping, 'parties')
    expect(evidence.objectMappings).toEqual([{ expression: 'parties.name' }])
    expect(evidence.linkMappings).toHaveLength(1)
    expect(evidence.expressions).toEqual(['parties.name', 'parties.status'])
    expect(evidence.relationships).toEqual(['status'])
    expect(evidence.fragmentCount).toBe(2)
  })

  it('searches concepts, fields and metric aliases without asset-specific rules', () => {
    const model = normalizeOssie(fullDocument)
    const index = buildSearchIndex(model)
    expect(searchIndex(index, 'legal entity', ['concept'])[0].name).toBe('legal_entity')
    expect(searchIndex(index, 'parties.name', ['field'])[0].kind).toBe('field')
    expect(searchIndex(index, 'party_count', ['metric'])[0].kind).toBe('metric')
  })
})
