import { describe, expect, it } from 'vitest'
import {
  buildSearchIndex,
  conceptMembers,
  mappingEvidenceForDataset,
  normalizeOssie,
  parseOssie,
  referencedDatasets,
  relationshipKind,
  resolveValueBase,
  roleKind,
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
    expect(parseOssie('{').errors[0].code).toBe('issue.jsonSyntax')
    const invalid = structuredClone(pureOntology)
    invalid.ontology[1].extends = ['missing_parent']
    expect(validateOssie(invalid).errors).toContainEqual({
      path: '$.ontology[1].extends[0]',
      code: 'issue.unknownParent',
      params: { name: 'missing_parent' },
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

const classified = {
  version: '0.2.0.dev0',
  name: 'classification',
  ontology: [
    {
      concept: 'party',
      type: 'EntityType',
      identify_by: ['tax_id'],
      relationships: [
        { name: 'tax_id', roles: [{ concept: 'tax_number' }], verbalizes: ['{party} has {tax_number}'] },
        { name: 'label', roles: [{ concept: 'String' }], verbalizes: ['{party} is called {String}'] },
        { name: 'active', verbalizes: ['{party} is active'] },
        { name: 'related_to', roles: [{ concept: 'Any' }], verbalizes: ['{party} relates to {Any}'] },
      ],
    },
    {
      concept: 'customer',
      type: 'EntityType',
      extends: ['party'],
      relationships: [
        { name: 'places', roles: [{ concept: 'order' }], verbalizes: ['{customer} places {order}'] },
        // Same name as the parent's, so the child's version has to win.
        { name: 'label', roles: [{ concept: 'display_name' }], verbalizes: ['{customer} is called {display_name}'] },
      ],
    },
    {
      concept: 'order',
      type: 'EntityType',
      relationships: [
        {
          name: 'priced_on',
          roles: [{ concept: 'customer' }, { concept: 'Date' }],
          verbalizes: ['{order} priced for {customer} on {Date}'],
        },
      ],
    },
    { concept: 'tax_number', type: 'ValueType', extends: ['String'], requires: ['LENGTH(tax_number) = 9'] },
    { concept: 'display_name', type: 'ValueType', extends: ['tax_number'] },
    { concept: 'dangling', type: 'ValueType' },
  ],
}

describe('relationship classification', () => {
  const model = normalizeOssie(classified)
  const relationshipsOf = (concept) =>
    Object.fromEntries((model.conceptByName.get(concept).relationships || []).map((item) => [item.name, item]))

  it('reads a role by the type of the concept it points at', () => {
    expect(roleKind('String', model)).toBe('builtinValue')
    // `Any` is a built-in entity type, not a value.
    expect(roleKind('Any', model)).toBe('builtinEntity')
    expect(roleKind('tax_number', model)).toBe('value')
    expect(roleKind('party', model)).toBe('entity')
    expect(roleKind('nowhere', model)).toBe('unknown')
  })

  it('separates attributes, entity relations, objectified facts and unary facts', () => {
    const party = relationshipsOf('party')
    expect(relationshipKind(party.tax_id, model)).toBe('attribute')
    expect(relationshipKind(party.label, model)).toBe('attribute')
    expect(relationshipKind(party.active, model)).toBe('unary')
    expect(relationshipKind(party.related_to, model)).toBe('association')
    expect(relationshipKind(relationshipsOf('customer').places, model)).toBe('association')
    expect(relationshipKind(relationshipsOf('order').priced_on, model)).toBe('objectified')
  })

  it('follows an extends chain to the built-in a value type is founded on', () => {
    expect(resolveValueBase('String', model)).toBe('String')
    expect(resolveValueBase('tax_number', model)).toBe('String')
    expect(resolveValueBase('display_name', model)).toBe('String')
    expect(resolveValueBase('dangling', model)).toBe(null)
  })

  it('survives an extends cycle instead of walking it forever', () => {
    const looped = structuredClone(classified)
    looped.ontology.find((concept) => concept.concept === 'tax_number').extends = ['display_name']
    expect(resolveValueBase('tax_number', normalizeOssie(looped))).toBe(null)
  })

  it('collects inherited members and lets a subtype override the parent', () => {
    const customer = conceptMembers(model.conceptByName.get('customer'), model)
    expect(customer.attributes.map((member) => [member.name, member.inheritedFrom])).toEqual([
      // Declared on customer, so it shadows party's `label`.
      ['label', null],
      ['tax_id', 'party'],
      ['active', 'party'],
    ])
    expect(customer.associations.map((member) => member.name)).toEqual(['places', 'related_to'])
    // party identifies itself by `tax_id`, and customer inherits that identity.
    expect(customer.attributes.find((member) => member.name === 'tax_id').keyIndex).toBe(0)
    expect(customer.attributes.find((member) => member.name === 'label').keyIndex).toBe(-1)
  })

  it('lets a concept see the relationships that point at it', () => {
    const order = conceptMembers(model.conceptByName.get('order'), model)
    expect(order.inbound.map((entry) => entry.path)).toEqual(['customer.places'])
    // A value type is reached the same way, which is how it lists its users.
    expect(model.inboundByConcept.get('tax_number').map((entry) => entry.path)).toEqual(['party.tax_id'])
  })

  it('indexes value types apart from entity types', () => {
    const index = buildSearchIndex(model)
    expect(searchIndex(index, 'tax number', ['concept'])).toEqual([])
    expect(searchIndex(index, 'tax number', ['valueType'])[0].name).toBe('tax_number')
  })
})
