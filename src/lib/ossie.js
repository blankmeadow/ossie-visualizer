const BUILTIN_CONCEPTS = new Set([
  'Any',
  'Boolean',
  'Date',
  'DateTime',
  'Decimal',
  'Float',
  'Integer',
  'String',
  'Time',
  'DateTimeTz',
])

export function parseOssie(text) {
  let document
  try {
    document = JSON.parse(text)
  } catch (error) {
    return {
      document: null,
      errors: [{ path: '$', message: `JSON 语法错误：${error.message}` }],
      warnings: [],
    }
  }

  const { errors, warnings } = validateOssie(document)
  return { document, errors, warnings }
}

export function validateOssie(document) {
  const errors = []
  const warnings = []
  const issue = (target, path, message) => target.push({ path, message })

  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    issue(errors, '$', '根节点必须是 JSON 对象。')
    return { errors, warnings }
  }
  if (!document.version) issue(errors, '$.version', '缺少 Ossie version。')
  if (!document.name) issue(errors, '$.name', '缺少本体 name。')
  if (!Array.isArray(document.ontology) || !document.ontology.length) {
    issue(errors, '$.ontology', 'ontology 必须是非空数组。')
    return { errors, warnings }
  }

  const conceptNames = new Set()
  document.ontology.forEach((concept, index) => {
    const base = `$.ontology[${index}]`
    if (!concept?.concept) issue(errors, `${base}.concept`, 'Concept 缺少名称。')
    if (!['EntityType', 'ValueType'].includes(concept?.type)) {
      issue(errors, `${base}.type`, 'Concept type 必须是 EntityType 或 ValueType。')
    }
    if (conceptNames.has(concept?.concept)) {
      issue(errors, `${base}.concept`, `Concept 名称重复：${concept.concept}`)
    }
    conceptNames.add(concept?.concept)

    const relationshipNames = new Set()
    ;(concept?.relationships || []).forEach((relationship, relationIndex) => {
      const relationBase = `${base}.relationships[${relationIndex}]`
      if (!relationship.name) issue(errors, `${relationBase}.name`, 'Relationship 缺少名称。')
      if (relationshipNames.has(relationship.name)) {
        issue(errors, `${relationBase}.name`, `Relationship 名称重复：${relationship.name}`)
      }
      relationshipNames.add(relationship.name)
      if (!Array.isArray(relationship.verbalizes) || !relationship.verbalizes.length) {
        issue(errors, `${relationBase}.verbalizes`, 'Relationship 必须提供 verbalizes。')
      }
    })
  })

  document.ontology.forEach((concept, index) => {
    const base = `$.ontology[${index}]`
    ;(concept.extends || []).forEach((parent, parentIndex) => {
      if (!conceptNames.has(parent) && !BUILTIN_CONCEPTS.has(parent)) {
        issue(errors, `${base}.extends[${parentIndex}]`, `未知父概念：${parent}`)
      }
    })
    const relationships = new Set((concept.relationships || []).map((item) => item.name))
    ;(concept.identify_by || []).forEach((name, identityIndex) => {
      if (!relationships.has(name)) {
        issue(errors, `${base}.identify_by[${identityIndex}]`, `身份关系不存在：${name}`)
      }
    })
    ;(concept.relationships || []).forEach((relationship, relationIndex) => {
      ;(relationship.roles || []).forEach((role, roleIndex) => {
        if (!conceptNames.has(role.concept) && !BUILTIN_CONCEPTS.has(role.concept)) {
          issue(
            errors,
            `${base}.relationships[${relationIndex}].roles[${roleIndex}].concept`,
            `未知角色概念：${role.concept}`,
          )
        }
      })
    })
  })

  for (const [mappingIndex, ontologyMapping] of (document.ontology_mappings || []).entries()) {
    const mappingBase = `$.ontology_mappings[${mappingIndex}]`
    const semanticModel = ontologyMapping.semantic_model
    if (!semanticModel) {
      issue(warnings, `${mappingBase}.semantic_model`, '该 Ontology Mapping 没有关联 Semantic Model。')
      continue
    }
    const datasets = new Map((semanticModel.datasets || []).map((dataset) => [dataset.name, dataset]))
    for (const [relationIndex, relationship] of (semanticModel.relationships || []).entries()) {
      for (const side of ['from', 'to']) {
        if (!datasets.has(relationship[side])) {
          issue(
            errors,
            `${mappingBase}.semantic_model.relationships[${relationIndex}].${side}`,
            `未知 Dataset：${relationship[side]}`,
          )
        }
      }
    }
    for (const [conceptMappingIndex, conceptMapping] of (ontologyMapping.concept_mappings || []).entries()) {
      if (!conceptNames.has(conceptMapping.concept)) {
        issue(
          errors,
          `${mappingBase}.concept_mappings[${conceptMappingIndex}].concept`,
          `Mapping 引用了未知 Concept：${conceptMapping.concept}`,
        )
      }
    }
  }

  if (!document.ontology_mappings?.length) {
    issue(warnings, '$.ontology_mappings', '这是纯 Ontology 文档；语义模型和映射视图将保持为空。')
  }

  return { errors, warnings }
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

  return {
    document,
    concepts,
    conceptByName: new Map(concepts.map((concept) => [concept.concept, concept])),
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
      kind: 'concept',
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

export { BUILTIN_CONCEPTS }
