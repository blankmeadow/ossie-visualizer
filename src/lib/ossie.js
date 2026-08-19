import { parse as parseYaml } from 'yaml'

// Ossie has no discriminator on a relationship: `EntityType -> EntityType` and
// `EntityType -> ValueType` are the same JSON shape. The only reliable judgement
// is the *type of the concept a role points at*, so the built-ins have to be
// split the way the spec splits them -- `Any` is a built-in entity type, the
// rest are built-in value types. Lumping them together classifies `-> Any` as
// an attribute, which it is not.
const BUILTIN_VALUE_TYPES = new Set([
  'Boolean',
  'Date',
  'DateTime',
  'DateTimeTz',
  'Decimal',
  'Float',
  'Integer',
  'String',
  'Time',
])

const BUILTIN_ENTITY_TYPES = new Set(['Any'])

const BUILTIN_CONCEPTS = new Set([...BUILTIN_VALUE_TYPES, ...BUILTIN_ENTITY_TYPES])

/**
 * Read an Ossie document written as either JSON or YAML.
 *
 * The specification and Apache Ossie's own examples are written in YAML, so a
 * reader should be able to open one without converting it first. YAML 1.2 is a
 * superset of JSON, but JSON is tried first: it is the stricter grammar and it
 * reports a syntax error the reader can act on, where the YAML parser would
 * quietly accept some malformed JSON as a plain string.
 */
export function parseOssie(text) {
  let document
  let format = 'json'
  try {
    document = JSON.parse(text)
  } catch (jsonError) {
    try {
      format = 'yaml'
      document = parseYaml(text)
    } catch (yamlError) {
      // Whichever grammar the input was reaching for, report the failure that
      // fits it: a leading brace or bracket means JSON was intended.
      const looksLikeJson = /^[\s﻿]*[[{]/.test(text)
      return {
        document: null,
        format,
        errors: [{
          path: '$',
          code: looksLikeJson ? 'issue.jsonSyntax' : 'issue.yamlSyntax',
          params: { message: (looksLikeJson ? jsonError : yamlError).message },
        }],
        warnings: [],
      }
    }
  }

  const { errors, warnings } = validateOssie(document)
  return { document, format, errors, warnings }
}

/**
 * Issues carry a message code and its parameters rather than a finished
 * sentence, so the same result can be rendered in either language.
 */
export function validateOssie(document) {
  const errors = []
  const warnings = []
  const issue = (target, path, code, params) => target.push({ path, code, params })

  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    issue(errors, '$', 'issue.rootNotObject')
    return { errors, warnings }
  }
  if (!document.version) issue(errors, '$.version', 'issue.versionMissing')
  if (!document.name) issue(errors, '$.name', 'issue.nameMissing')
  if (!Array.isArray(document.ontology) || !document.ontology.length) {
    issue(errors, '$.ontology', 'issue.ontologyEmpty')
    return { errors, warnings }
  }

  const conceptNames = new Set()
  document.ontology.forEach((concept, index) => {
    const base = `$.ontology[${index}]`
    if (!concept?.concept) issue(errors, `${base}.concept`, 'issue.conceptNameMissing')
    if (!['EntityType', 'ValueType'].includes(concept?.type)) {
      issue(errors, `${base}.type`, 'issue.conceptTypeInvalid')
    }
    if (conceptNames.has(concept?.concept)) {
      issue(errors, `${base}.concept`, 'issue.conceptDuplicate', { name: concept.concept })
    }
    conceptNames.add(concept?.concept)

    const relationshipNames = new Set()
    ;(concept?.relationships || []).forEach((relationship, relationIndex) => {
      const relationBase = `${base}.relationships[${relationIndex}]`
      if (!relationship.name) issue(errors, `${relationBase}.name`, 'issue.relationshipNameMissing')
      if (relationshipNames.has(relationship.name)) {
        issue(errors, `${relationBase}.name`, 'issue.relationshipDuplicate', { name: relationship.name })
      }
      relationshipNames.add(relationship.name)
      if (!Array.isArray(relationship.verbalizes) || !relationship.verbalizes.length) {
        issue(errors, `${relationBase}.verbalizes`, 'issue.verbalizesMissing')
      }
    })
  })

  document.ontology.forEach((concept, index) => {
    const base = `$.ontology[${index}]`
    ;(concept.extends || []).forEach((parent, parentIndex) => {
      if (!conceptNames.has(parent) && !BUILTIN_CONCEPTS.has(parent)) {
        issue(errors, `${base}.extends[${parentIndex}]`, 'issue.unknownParent', { name: parent })
      }
    })
    const relationships = new Set((concept.relationships || []).map((item) => item.name))
    ;(concept.identify_by || []).forEach((name, identityIndex) => {
      if (!relationships.has(name)) {
        issue(errors, `${base}.identify_by[${identityIndex}]`, 'issue.unknownIdentity', { name })
      }
    })
    ;(concept.relationships || []).forEach((relationship, relationIndex) => {
      ;(relationship.roles || []).forEach((role, roleIndex) => {
        if (!conceptNames.has(role.concept) && !BUILTIN_CONCEPTS.has(role.concept)) {
          issue(
            errors,
            `${base}.relationships[${relationIndex}].roles[${roleIndex}].concept`,
            'issue.unknownRoleConcept',
            { name: role.concept },
          )
        }
      })
    })
  })

  for (const [mappingIndex, ontologyMapping] of (document.ontology_mappings || []).entries()) {
    const mappingBase = `$.ontology_mappings[${mappingIndex}]`
    const semanticModel = ontologyMapping.semantic_model
    if (!semanticModel) {
      issue(warnings, `${mappingBase}.semantic_model`, 'issue.mappingWithoutModel')
      continue
    }
    const datasets = new Map((semanticModel.datasets || []).map((dataset) => [dataset.name, dataset]))
    for (const [relationIndex, relationship] of (semanticModel.relationships || []).entries()) {
      for (const side of ['from', 'to']) {
        if (!datasets.has(relationship[side])) {
          issue(
            errors,
            `${mappingBase}.semantic_model.relationships[${relationIndex}].${side}`,
            'issue.unknownDataset',
            { name: relationship[side] },
          )
        }
      }
    }
    for (const [conceptMappingIndex, conceptMapping] of (ontologyMapping.concept_mappings || []).entries()) {
      if (!conceptNames.has(conceptMapping.concept)) {
        issue(
          errors,
          `${mappingBase}.concept_mappings[${conceptMappingIndex}].concept`,
          'issue.unknownMappedConcept',
          { name: conceptMapping.concept },
        )
      }
    }
  }

  if (!document.ontology_mappings?.length) {
    issue(warnings, '$.ontology_mappings', 'issue.pureOntology')
  }

  return { errors, warnings }
}

const ENTITY_ROLE_KINDS = new Set(['entity', 'builtinEntity'])

/**
 * Which side of the ontology the concept playing a role sits on.
 *
 * Built-ins are not members of `ontology`, so they have to be checked before
 * the concept map, otherwise every `String` role reads as an unknown concept.
 */
export function roleKind(name, model) {
  if (BUILTIN_VALUE_TYPES.has(name)) return 'builtinValue'
  if (BUILTIN_ENTITY_TYPES.has(name)) return 'builtinEntity'
  const concept = model?.conceptByName?.get(name)
  if (!concept) return 'unknown'
  return concept.type === 'ValueType' ? 'value' : 'entity'
}

/**
 * Walk a value type's `extends` chain down to the built-in it is founded on.
 * The spec requires every value type to reach one, but a document stitched
 * together from several sources can dangle or loop, so both end in `null`
 * rather than a crash or an endless walk.
 */
export function resolveValueBase(name, model, seen = new Set()) {
  if (BUILTIN_VALUE_TYPES.has(name)) return name
  if (seen.has(name)) return null
  seen.add(name)
  for (const parent of model?.conceptByName?.get(name)?.extends || []) {
    const base = resolveValueBase(parent, model, seen)
    if (base) return base
  }
  return null
}

/**
 * Classify a relationship by the concepts its roles point at, since the
 * relationship itself carries no discriminator:
 *
 *   unary        no explicit role, a trait of the owning concept alone
 *   attribute    every role lands on a value type or a built-in value type
 *   association  every role lands on an entity type
 *   objectified  entity and value roles mixed, an objectified fact type
 */
export function relationshipKind(relationship, model) {
  const kinds = (relationship?.roles || []).map((role) => roleKind(role.concept, model))
  if (!kinds.length) return 'unary'
  const entities = kinds.filter((kind) => ENTITY_ROLE_KINDS.has(kind)).length
  if (!entities) return 'attribute'
  return entities === kinds.length ? 'association' : 'objectified'
}

/** The concept itself, then its ancestors, breadth-first and cycle-safe. */
function inheritanceChain(concept, model) {
  const chain = []
  const seen = new Set()
  const queue = [concept]
  while (queue.length) {
    const current = queue.shift()
    if (!current || seen.has(current.concept)) continue
    seen.add(current.concept)
    chain.push(current)
    for (const parent of current.extends || []) {
      if (!seen.has(parent)) queue.push(model.conceptByName.get(parent))
    }
  }
  return chain
}

/**
 * Everything a concept can be described by: the value-typed facts about it,
 * the links it declares to other entities, and the links other entities
 * declare to it.
 *
 * Members are collected across the `extends` chain, so a subtype shows what it
 * inherits instead of looking empty. A name resolved once is not resolved
 * again, which makes a subtype's own relationship override the parent's of the
 * same name and keeps diamond inheritance from listing a member twice.
 */
export function conceptMembers(concept, model) {
  if (!concept) return { attributes: [], associations: [], inbound: [] }
  const attributes = []
  const associations = []
  const claimed = new Set()
  const identity = concept.identify_by || []

  for (const source of inheritanceChain(concept, model)) {
    const inherited = source.concept !== concept.concept
    for (const relationship of source.relationships || []) {
      if (claimed.has(relationship.name)) continue
      claimed.add(relationship.name)
      const kind = relationshipKind(relationship, model)
      const ownKey = identity.indexOf(relationship.name)
      const member = {
        relationship,
        name: relationship.name,
        owner: source.concept,
        path: `${source.concept}.${relationship.name}`,
        kind,
        inheritedFrom: inherited ? source.concept : null,
        // A subtype's own `identify_by` wins; otherwise the identity it
        // inherits along with the relationship still shows.
        keyIndex: ownKey >= 0 || !inherited ? ownKey : (source.identify_by || []).indexOf(relationship.name),
      }
      if (kind === 'association' || kind === 'objectified') associations.push(member)
      else attributes.push(member)
    }
  }

  return { attributes, associations, inbound: model.inboundByConcept?.get(concept.concept) || [] }
}

export function normalizeOssie(document) {
  const concepts = document.ontology || []
  const ontologyMappings = document.ontology_mappings || []
  const semanticModels = ontologyMappings
    .map((mapping, index) => ({ ...mapping.semantic_model, _mappingIndex: index }))
    .filter((model) => model.name || model.datasets || model.metrics || model.relationships)
  const datasets = semanticModels.flatMap((model) =>
    (model.datasets || []).map((dataset) => ({ ...dataset, _semanticModel: model.name })),
  )
  const semanticRelationships = semanticModels.flatMap((model) =>
    (model.relationships || []).map((relationship) => ({
      ...relationship,
      _semanticModel: model.name,
    })),
  )
  const metrics = semanticModels.flatMap((model) =>
    (model.metrics || []).map((metric) => ({ ...metric, _semanticModel: model.name })),
  )
  const conceptMappings = ontologyMappings.flatMap((mapping, mappingIndex) =>
    (mapping.concept_mappings || []).map((conceptMapping, conceptMappingIndex) => ({
      ...conceptMapping,
      _mappingName: mapping.name || `mapping_${mappingIndex + 1}`,
      _mappingIndex: mappingIndex,
      _conceptMappingIndex: conceptMappingIndex,
    })),
  )
  const ontologyRelationships = concepts.flatMap((concept) =>
    (concept.relationships || []).map((relationship) => ({
      ...relationship,
      owner: concept.concept,
      path: `${concept.concept}.${relationship.name}`,
    })),
  )
  const conceptByName = new Map(concepts.map((concept) => [concept.concept, concept]))
  const lookup = { conceptByName }

  // A relationship is only declared under one concept, so the concepts it
  // points at cannot find it by looking at themselves. Index the reverse
  // direction once here rather than scanning every relationship each time a
  // concept is selected.
  const inboundByConcept = new Map(concepts.map((concept) => [concept.concept, []]))
  for (const relationship of ontologyRelationships) {
    const seen = new Set()
    for (const role of relationship.roles || []) {
      // A self-reference is already listed among the concept's own
      // relationships; repeating it as inbound would double it up.
      if (role.concept === relationship.owner || seen.has(role.concept)) continue
      seen.add(role.concept)
      inboundByConcept.get(role.concept)?.push({
        relationship,
        owner: relationship.owner,
        path: relationship.path,
        role,
      })
    }
  }

  const relationshipKinds = ontologyRelationships.map((relationship) => relationshipKind(relationship, lookup))

  return {
    document,
    concepts,
    conceptByName,
    inboundByConcept,
    ontologyRelationships,
    ontologyMappings,
    semanticModels,
    datasets,
    datasetByName: new Map(datasets.map((dataset) => [dataset.name, dataset])),
    semanticRelationships,
    metrics,
    conceptMappings,
    stats: {
      entityTypes: concepts.filter((concept) => concept.type === 'EntityType').length,
      valueTypes: concepts.filter((concept) => concept.type === 'ValueType').length,
      ontologyRelationships: ontologyRelationships.length,
      attributeRelationships: relationshipKinds.filter((kind) => kind === 'attribute' || kind === 'unary').length,
      associationRelationships: relationshipKinds.filter((kind) => kind === 'association' || kind === 'objectified').length,
      datasets: datasets.length,
      fields: datasets.reduce((total, dataset) => total + (dataset.fields?.length || 0), 0),
      semanticRelationships: semanticRelationships.length,
      metrics: metrics.length,
      conceptMappings: conceptMappings.length,
    },
  }
}

function searchableText(...values) {
  return normalizeSearchText(
    values
    .flat(Infinity)
    .filter((value) => typeof value === 'string')
    .join(' '),
  )
}

function normalizeSearchText(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[._:/\\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase()
}

function aiTerms(aiContext) {
  if (!aiContext) return []
  if (typeof aiContext === 'string') return [aiContext]
  return [aiContext.instructions, ...(aiContext.synonyms || []), ...(aiContext.examples || [])]
}

export function buildSearchIndex(model) {
  const items = []
  for (const concept of model.concepts) {
    items.push({
      id: `concept:${concept.concept}`,
      // Value types are browsed through the attribute table of the entity that
      // uses them, so they are indexed under their own kind and the ontology
      // index simply does not ask for it.
      kind: concept.type === 'ValueType' ? 'valueType' : 'concept',
      name: concept.concept,
      description: concept.description || '',
      target: concept,
      haystack: searchableText(concept.concept, concept.description, concept.extends),
    })
  }
  for (const relationship of model.ontologyRelationships) {
    items.push({
      id: `relationship:${relationship.path}`,
      kind: 'relationship',
      name: relationship.path,
      description: relationship.description || relationship.verbalizes?.[0] || '',
      target: relationship,
      haystack: searchableText(
        relationship.path,
        relationship.description,
        relationship.verbalizes,
        relationship.roles?.map((role) => [role.concept, role.name]),
      ),
    })
  }
  for (const dataset of model.datasets) {
    items.push({
      id: `dataset:${dataset.name}`,
      kind: 'dataset',
      name: dataset.name,
      description: dataset.description || dataset.source || '',
      target: dataset,
      haystack: searchableText(
        dataset.name,
        dataset.description,
        dataset.source,
        aiTerms(dataset.ai_context),
      ),
    })
    for (const field of dataset.fields || []) {
      items.push({
        id: `field:${dataset.name}.${field.name}`,
        kind: 'field',
        name: `${dataset.name}.${field.name}`,
        description: field.description || '',
        target: { ...field, _dataset: dataset.name, _semanticModel: dataset._semanticModel },
        haystack: searchableText(
          dataset.name,
          field.name,
          field.description,
          field.datatype,
          aiTerms(field.ai_context),
        ),
      })
    }
  }
  for (const metric of model.metrics) {
    items.push({
      id: `metric:${metric.name}`,
      kind: 'metric',
      name: metric.name,
      description: metric.description || '',
      target: metric,
      haystack: searchableText(metric.name, metric.description, metric.datatype, aiTerms(metric.ai_context)),
    })
  }
  for (const conceptMapping of model.conceptMappings) {
    items.push({
      id: `mapping:${conceptMapping._mappingIndex}:${conceptMapping._conceptMappingIndex}`,
      kind: 'mapping',
      name: conceptMapping.concept,
      description: conceptMapping._mappingName,
      target: conceptMapping,
      haystack: searchableText(conceptMapping.concept, conceptMapping._mappingName),
    })
  }
  return items
}

export function searchIndex(items, query, kinds) {
  const normalized = normalizeSearchText(query)
  return items
    .filter((item) => !kinds?.length || kinds.includes(item.kind))
    .filter((item) => !normalized || item.haystack.includes(normalized))
    .sort((left, right) => {
      if (!normalized) return left.name.localeCompare(right.name)
      const leftName = normalizeSearchText(left.name)
      const rightName = normalizeSearchText(right.name)
      const leftExact = leftName === normalized ? 1 : 0
      const rightExact = rightName === normalized ? 1 : 0
      const leftPrefix = leftName.startsWith(normalized) ? 1 : 0
      const rightPrefix = rightName.startsWith(normalized) ? 1 : 0
      return rightExact - leftExact || rightPrefix - leftPrefix || left.name.localeCompare(right.name)
    })
}

export function collectExpressionStrings(value) {
  const result = []
  if (Array.isArray(value)) {
    value.forEach((item) => result.push(...collectExpressionStrings(item)))
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key === 'expression' && typeof child === 'string') result.push(child)
      result.push(...collectExpressionStrings(child))
    }
  }
  return result
}

export function referencedDatasets(value, datasetNames) {
  const referenced = new Set()
  for (const expression of collectExpressionStrings(value)) {
    const pattern = /\b([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\b/g
    for (const match of expression.matchAll(pattern)) {
      if (datasetNames.has(match[1])) referenced.add(match[1])
    }
  }
  return [...referenced].sort()
}

function mappingFragmentsForDataset(items, datasetName) {
  const names = new Set([datasetName])
  return (items || []).filter((item) => referencedDatasets(item, names).includes(datasetName))
}

function collectRelationshipReferences(value, result = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectRelationshipReferences(item, result))
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key === 'relationship' && typeof child === 'string') result.add(child)
      collectRelationshipReferences(child, result)
    }
  }
  return result
}

export function mappingEvidenceForDataset(conceptMapping, datasetName) {
  const objectMappings = mappingFragmentsForDataset(conceptMapping.object_mappings, datasetName)
  const linkMappings = mappingFragmentsForDataset(conceptMapping.link_mappings, datasetName)
  const fragments = [...objectMappings, ...linkMappings]
  return {
    dataset: datasetName,
    objectMappings,
    linkMappings,
    expressions: [...new Set(collectExpressionStrings(fragments))],
    relationships: [...collectRelationshipReferences(linkMappings)].sort(),
    fragmentCount: fragments.length,
  }
}

export function expressionText(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(expressionText).filter(Boolean).join('\n')
  if (value.dialects) {
    return value.dialects.map((item) => `${item.dialect}: ${item.expression}`).join('\n')
  }
  return JSON.stringify(value, null, 2)
}

export { BUILTIN_CONCEPTS, BUILTIN_ENTITY_TYPES, BUILTIN_VALUE_TYPES }
