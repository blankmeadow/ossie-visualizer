import { createContext, useContext, useEffect, useMemo, useState } from 'react'

/**
 * A two-language dictionary with no runtime dependency.
 *
 * Keys are grouped by the surface they appear on. Values may contain `{name}`
 * placeholders, filled by the second argument of `t`. Ossie's own vocabulary
 * (Concept, EntityType, ValueType, Dataset, Metric, Mapping) stays untranslated
 * on purpose: those are the spec's terms and the JSON uses them verbatim.
 */
export const LOCALES = ['zh', 'en']

const STORAGE_KEY = 'ossie-visualizer:locale'

const MESSAGES = {
  zh: {
    'locale.label': '中文',
    'locale.switch': '切换语言',

    'layout.resizeSidebar': '拖动调整目录宽度',
    'layout.resizeInspector': '拖动调整详情面板宽度',

    'app.import': '导入文档',
    'app.statusOk': '结构检查通过',
    'app.jsonLoading': '正在加载 JSON 查看器…',

    'tab.overview': '概览',
    'tab.ontology': '本体',
    'tab.semantic': '语义模型',
    'tab.mapping': '映射',
    'tab.json': '源文档',

    'welcome.title': '导入一个 Ossie 文档开始',
    'welcome.sample': '载入 Flights 示例',
    'welcome.cta': '导入 Ossie 文档',

    'overview.noDescription': '暂无文档描述。',
    'overview.requires': '文档级约束',
    'overview.statEntityTypes': 'Entity Types',
    'overview.statRelations': '实体间关系',
    'overview.statAttributes': '属性关系',
    'overview.statDatasets': 'Datasets',
    'overview.statFields': 'Fields',
    'overview.statMetrics': 'Metrics',
    'overview.statMappings': 'Concept Mappings',
    'overview.coverageTitle': '映射覆盖',
    'overview.coverageUnit': '{mapped} / {total} concepts',

    'sidebar.titleOntology': '实体目录',
    'sidebar.titleSemantic': '语义目录',
    'sidebar.titleMapping': '映射目录',
    'sidebar.search': '搜索名称、描述、同义词…',
    'sidebar.count': '{count} 项',
    'sidebar.empty': '没有匹配结果',
    'sidebar.filterAria': '筛选索引类型',
    'sidebar.filterMenu': '索引类型',
    'sidebar.filterLabel': '类型',
    'sidebar.filterAll': '全部',
    'sidebar.noDescription': '暂无描述',


    'toolbar.relationships': '实体关系',
    'toolbar.metrics': 'Metrics',
    'toolbar.depthAll': '全图',
    'toolbar.depthHops': '{count} 跳',
    'toolbar.focusHint': '按当前选择聚焦',
    'toolbar.focusHintEmpty': '选择节点后可聚焦',

    'legend.entityType': 'EntityType',
    'legend.extends': 'extends',
    'legend.relationship': '实体关系',
    'legend.dataset': 'Dataset',
    'legend.metric': 'Metric',
    'legend.concept': 'Concept',
    'legend.mapping': 'Mapping',

    'canvas.emptyTitle': '没有可展示的图',
    'canvas.emptyBody': '当前文档未包含这一层，或筛选结果为空。',
    'canvas.edgeFallback': '关系',
    'canvas.bundleCount': '{count} 条关系',
    'canvas.viewRelationship': '查看关系',
    'canvas.viewMapping': '查看映射证据',

    'inspector.emptyTitle': '选择一个语义元素',
    'inspector.emptyBody': '从索引、搜索结果或关系图选择 Concept、Dataset、Metric 或 Mapping。',
    'inspector.close': '关闭详情',
    'inspector.whatIsThis': '这是什么？',
    'inspector.closeDetail': '返回概念详情',
    'inspector.noDescription': '暂无描述。',

    'kind.entityType': 'ENTITY TYPE',
    'kind.valueType': 'VALUE TYPE',
    'kind.relationshipGroup': 'RELATIONSHIP BUNDLE',
    'kind.inheritance': 'ONTOLOGY INHERITANCE',
    'kind.dataset': 'SEMANTIC DATASET',
    'kind.field': 'SEMANTIC FIELD',
    'kind.metric': 'SEMANTIC METRIC',
    'kind.semanticRelationship': 'DATASET RELATIONSHIP',
    'kind.metricDependency': 'METRIC DEPENDENCY',
    'kind.mapping': 'CONCEPT MAPPING',
    'kind.mappingEvidence': 'MAPPING EVIDENCE',

    'concept.extends': '继承自',
    'concept.derivedBy': 'Derived by',
    'concept.requires': 'Requires',
    'concept.attributes': '属性',
    'concept.relations': '实体关系',
    'concept.inbound': '被引用的关系',
    'concept.extendedBy': '被继承',
    'concept.semanticLinks': '关联语义模型',
    'concept.groupOwn': '自有',
    'concept.groupInherited': '继承自 {name}',
    'concept.colName': '名称',
    'concept.colType': '类型',
    'concept.colConstraint': '约束',
    'concept.colTarget': '目标',
    'concept.colSource': '来源概念',
    'concept.unresolvedType': '未解析',
    'concept.noType': '—',
    'concept.key': 'PK',
    'concept.keyIndexed': 'PK{index}',
    'concept.requiresCount': 'requires ×{count}',
    'concept.facetCount': 'facet ×{count}',

    'relationship.kindAttribute': '属性',
    'relationship.kindAssociation': '实体关系',
    'relationship.kindObjectified': '对象化关系',
    'relationship.kindUnary': '一元事实',
    'relationship.participants': '涉及实体',
    'relationship.colEntity': '实体名称',
    'relationship.colRole': '角色',
    'relationship.implicitFirstRole': '隐式第一角色',
    'relationship.verbalizes': '关系语义',
    'relationship.derivedBy': 'Derived by',
    'relationship.requires': 'Requires',

    'valueType.base': '基础类型',
    'valueType.extends': '继承自',
    'valueType.requires': '约束',
    'valueType.usedBy': '被用作属性',
    'valueType.relationships': '自有关系',

    'group.description': '这条连线合并了同一对 Concept 之间的多条关系。选择其中一条可查看完整角色、规则和语义入口。',
    'group.from': 'From',
    'group.to': 'To',
    'group.relationships': 'Relationships',

    'inheritance.description': '{child} 继承 {parent}，并获得父 Concept 的关系和约束语义。',
    'inheritance.child': 'Child',
    'inheritance.parent': 'Parent',
    'inheritance.concepts': 'Concepts',
    'inheritance.childDerivedBy': 'Child Derived by',
    'inheritance.childRequires': 'Child Requires',

    'dataset.source': 'Source',
    'dataset.sourceUnknown': '未指定',
    'dataset.fields': 'Fields',
    'dataset.relationships': 'Dataset Relationships',
    'dataset.metrics': 'Related Metrics',
    'dataset.datatypeUnknown': 'unknown',

    'field.dataset': 'Dataset',
    'field.datatype': 'Datatype',
    'field.expression': 'Expression',
    'field.dimension': 'Dimension',

    'metric.datatype': 'Datatype',
    'metric.datasets': 'Datasets',
    'metric.expression': 'Expression',
    'metric.referenced': 'Referenced Datasets',

    'semanticRelationship.description': '连接两个 Dataset 的语义关系。',
    'semanticRelationship.from': 'From',
    'semanticRelationship.to': 'To',
    'semanticRelationship.datasets': 'Datasets',
    'semanticRelationship.joinFields': 'Join Fields',

    'metricDependency.description': '该 Dataset 为指标表达式提供字段和事实数据。',
    'metricDependency.dataset': 'Dataset',
    'metricDependency.metric': 'Metric',
    'metricDependency.navigate': 'Navigate',
    'metricDependency.expression': 'Metric Expression',

    'mapping.description': '本体 Concept 与逻辑语义模型之间的映射证据。',
    'mapping.concept': 'Concept',
    'mapping.referenced': 'Referenced Datasets',
    'mapping.colPath': '关系路径',
    'mapping.colExpression': '表达式',
    'mapping.objectMappings': 'Object Mappings',
    'mapping.linkMappings': 'Link Mappings',

    'evidence.datasetDescription': '这条边只展示当前 Dataset 实际参与的 Object/Link Mapping 证据，不混入同一 Concept 的其他数据集。',
    'evidence.conceptDescription': '这条边表示 Ontology Concept 选择了哪个 Concept Mapping；字段和关系证据位于下游的 Dataset 边。',
    'evidence.ontologyConcept': 'Ontology Concept',
    'evidence.semanticDataset': 'Semantic Dataset',
    'evidence.conceptMapping': 'Concept Mapping',
    'evidence.mapping': 'Mapping',
    'evidence.fragments': 'Evidence Fragments',
    'evidence.expressions': 'Mapped Expressions',
    'evidence.relationships': 'Relationship References',
    'evidence.objectFragment': 'Object Mapping Fragment',
    'evidence.linkFragment': 'Link Mapping Fragment',
    'evidence.datasetSource': 'Dataset Source',
    'evidence.navigate': 'Navigate',

    'aiContext.title': 'AI Context',

    'import.title': '导入 Ossie 文档',
    'import.close': '关闭',
    'import.textarea': '粘贴 Ossie JSON 或 YAML',
    'import.placeholder': '粘贴文档内容，或把文件拖进来',
    'import.release': '松开以载入',
    'import.orChoose': '选择文件…',
    'import.formats': '.json · .yaml · .yml，本地解析，不上传',
    'import.errorTitle': '无法导入，{count} 个问题',
    'import.errorMore': '另有 {count} 个未列出',
    'import.cancel': '取消',
    'import.submit': '导入',

    'json.eyebrow': '源文档',
    'json.title': '原始 Ossie JSON',
    'json.titleYaml': '原始 Ossie YAML',
    'json.readonly': '只读',
    'json.search': '搜索',
    'json.foldTop': '折叠到顶层',
    'json.unfoldAll': '全部展开',

    'issue.jsonSyntax': 'JSON 语法错误：{message}',
    'issue.yamlSyntax': 'YAML 语法错误：{message}',
    'issue.rootNotObject': '根节点必须是 JSON 对象。',
    'issue.versionMissing': '缺少 Ossie version。',
    'issue.nameMissing': '缺少本体 name。',
    'issue.ontologyEmpty': 'ontology 必须是非空数组。',
    'issue.conceptNameMissing': 'Concept 缺少名称。',
    'issue.conceptTypeInvalid': 'Concept type 必须是 EntityType 或 ValueType。',
    'issue.conceptDuplicate': 'Concept 名称重复：{name}',
    'issue.relationshipNameMissing': 'Relationship 缺少名称。',
    'issue.relationshipDuplicate': 'Relationship 名称重复：{name}',
    'issue.verbalizesMissing': 'Relationship 必须提供 verbalizes。',
    'issue.unknownParent': '未知父概念：{name}',
    'issue.unknownIdentity': '身份关系不存在：{name}',
    'issue.unknownRoleConcept': '未知角色概念：{name}',
    'issue.mappingWithoutModel': '该 Ontology Mapping 没有关联 Semantic Model。',
    'issue.unknownDataset': '未知 Dataset：{name}',
    'issue.unknownMappedConcept': 'Mapping 引用了未知 Concept：{name}',
    'issue.pureOntology': '这是纯 Ontology 文档；语义模型和映射视图将保持为空。',
  },

  en: {
    'locale.label': 'EN',
    'locale.switch': 'Switch language',

    'layout.resizeSidebar': 'Drag to resize the index',
    'layout.resizeInspector': 'Drag to resize the details panel',

    'app.import': 'Import document',
    'app.statusOk': 'Structure check passed',
    'app.jsonLoading': 'Loading the JSON viewer…',

    'tab.overview': 'Overview',
    'tab.ontology': 'Ontology',
    'tab.semantic': 'Semantic Model',
    'tab.mapping': 'Mapping',
    'tab.json': 'Source',

    'welcome.title': 'Open an Ossie document to begin',
    'welcome.sample': 'Load the Flights example',
    'welcome.cta': 'Import an Ossie document',

    'overview.noDescription': 'No document description.',
    'overview.requires': 'DOCUMENT CONSTRAINTS',
    'overview.statEntityTypes': 'Entity Types',
    'overview.statRelations': 'Entity Relations',
    'overview.statAttributes': 'Attributes',
    'overview.statDatasets': 'Datasets',
    'overview.statFields': 'Fields',
    'overview.statMetrics': 'Metrics',
    'overview.statMappings': 'Concept Mappings',
    'overview.coverageTitle': 'Mapping coverage',
    'overview.coverageUnit': '{mapped} / {total} concepts',

    'sidebar.titleOntology': 'Ontology Index',
    'sidebar.titleSemantic': 'Semantic Index',
    'sidebar.titleMapping': 'Mapping Directory',
    'sidebar.search': 'Search names, descriptions, synonyms…',
    'sidebar.count': '{count} items',
    'sidebar.empty': 'No matches',
    'sidebar.filterAria': 'Filter index by kind',
    'sidebar.filterMenu': 'Index kind',
    'sidebar.filterLabel': 'Kind',
    'sidebar.filterAll': 'All',
    'sidebar.noDescription': 'No description',


    'toolbar.relationships': 'Entity relations',
    'toolbar.metrics': 'Metrics',
    'toolbar.depthAll': 'Whole graph',
    'toolbar.depthHops': '{count} hop',
    'toolbar.focusHint': 'Focus on the current selection',
    'toolbar.focusHintEmpty': 'Select a node to focus',

    'legend.entityType': 'EntityType',
    'legend.extends': 'extends',
    'legend.relationship': 'entity relation',
    'legend.dataset': 'Dataset',
    'legend.metric': 'Metric',
    'legend.concept': 'Concept',
    'legend.mapping': 'Mapping',

    'canvas.emptyTitle': 'Nothing to draw',
    'canvas.emptyBody': 'This document has no such layer, or the filters matched nothing.',
    'canvas.edgeFallback': 'relationship',
    'canvas.bundleCount': '{count} relationships',
    'canvas.viewRelationship': 'View relationship',
    'canvas.viewMapping': 'View mapping evidence',

    'inspector.emptyTitle': 'Select an element',
    'inspector.emptyBody': 'Pick a Concept, Dataset, Metric or Mapping from the index, the search results or the graph.',
    'inspector.close': 'Close details',
    'inspector.whatIsThis': 'What is this?',
    'inspector.closeDetail': 'Back to the concept',
    'inspector.noDescription': 'No description.',

    'kind.entityType': 'ENTITY TYPE',
    'kind.valueType': 'VALUE TYPE',
    'kind.relationshipGroup': 'RELATIONSHIP BUNDLE',
    'kind.inheritance': 'ONTOLOGY INHERITANCE',
    'kind.dataset': 'SEMANTIC DATASET',
    'kind.field': 'SEMANTIC FIELD',
    'kind.metric': 'SEMANTIC METRIC',
    'kind.semanticRelationship': 'DATASET RELATIONSHIP',
    'kind.metricDependency': 'METRIC DEPENDENCY',
    'kind.mapping': 'CONCEPT MAPPING',
    'kind.mappingEvidence': 'MAPPING EVIDENCE',

    'concept.extends': 'Extends',
    'concept.derivedBy': 'Derived by',
    'concept.requires': 'Requires',
    'concept.attributes': 'Attributes',
    'concept.relations': 'Entity relations',
    'concept.inbound': 'Referenced by',
    'concept.extendedBy': 'Extended by',
    'concept.semanticLinks': 'Linked semantic model',
    'concept.groupOwn': 'Declared here',
    'concept.groupInherited': 'Inherited from {name}',
    'concept.colName': 'Name',
    'concept.colType': 'Type',
    'concept.colConstraint': 'Constraints',
    'concept.colTarget': 'Target',
    'concept.colSource': 'Source concept',
    'concept.unresolvedType': 'unresolved',
    'concept.noType': '—',
    'concept.key': 'PK',
    'concept.keyIndexed': 'PK{index}',
    'concept.requiresCount': 'requires ×{count}',
    'concept.facetCount': 'facet ×{count}',

    'relationship.kindAttribute': 'Attribute',
    'relationship.kindAssociation': 'Entity relation',
    'relationship.kindObjectified': 'Objectified fact',
    'relationship.kindUnary': 'Unary fact',
    'relationship.participants': 'Participating entities',
    'relationship.colEntity': 'Entity',
    'relationship.colRole': 'Role',
    'relationship.implicitFirstRole': 'implicit first role',
    'relationship.verbalizes': 'Verbalizes',
    'relationship.derivedBy': 'Derived by',
    'relationship.requires': 'Requires',

    'valueType.base': 'Base type',
    'valueType.extends': 'Extends',
    'valueType.requires': 'Constraints',
    'valueType.usedBy': 'Used as an attribute by',
    'valueType.relationships': 'Own relationships',

    'group.description': 'This edge bundles several relationships between the same pair of concepts. Pick one to see its roles, rules and semantic links.',
    'group.from': 'From',
    'group.to': 'To',
    'group.relationships': 'Relationships',

    'inheritance.description': '{child} extends {parent}, inheriting the parent concept relationships and constraints.',
    'inheritance.child': 'Child',
    'inheritance.parent': 'Parent',
    'inheritance.concepts': 'Concepts',
    'inheritance.childDerivedBy': 'Child Derived by',
    'inheritance.childRequires': 'Child Requires',

    'dataset.source': 'Source',
    'dataset.sourceUnknown': 'unspecified',
    'dataset.fields': 'Fields',
    'dataset.relationships': 'Dataset Relationships',
    'dataset.metrics': 'Related Metrics',
    'dataset.datatypeUnknown': 'unknown',

    'field.dataset': 'Dataset',
    'field.datatype': 'Datatype',
    'field.expression': 'Expression',
    'field.dimension': 'Dimension',

    'metric.datatype': 'Datatype',
    'metric.datasets': 'Datasets',
    'metric.expression': 'Expression',
    'metric.referenced': 'Referenced Datasets',

    'semanticRelationship.description': 'A semantic relationship joining two datasets.',
    'semanticRelationship.from': 'From',
    'semanticRelationship.to': 'To',
    'semanticRelationship.datasets': 'Datasets',
    'semanticRelationship.joinFields': 'Join Fields',

    'metricDependency.description': 'This dataset supplies the fields and facts the metric expression reads.',
    'metricDependency.dataset': 'Dataset',
    'metricDependency.metric': 'Metric',
    'metricDependency.navigate': 'Navigate',
    'metricDependency.expression': 'Metric Expression',

    'mapping.description': 'Mapping evidence between an ontology concept and the logical semantic model.',
    'mapping.concept': 'Concept',
    'mapping.referenced': 'Referenced Datasets',
    'mapping.colPath': 'Relationship path',
    'mapping.colExpression': 'Expression',
    'mapping.objectMappings': 'Object Mappings',
    'mapping.linkMappings': 'Link Mappings',

    'evidence.datasetDescription': 'This edge shows only the object/link mapping evidence this dataset actually takes part in, not the other datasets of the same concept.',
    'evidence.conceptDescription': 'This edge shows which concept mapping the ontology concept selected; the field and relationship evidence sits on the dataset edges downstream.',
    'evidence.ontologyConcept': 'Ontology Concept',
    'evidence.semanticDataset': 'Semantic Dataset',
    'evidence.conceptMapping': 'Concept Mapping',
    'evidence.mapping': 'Mapping',
    'evidence.fragments': 'Evidence Fragments',
    'evidence.expressions': 'Mapped Expressions',
    'evidence.relationships': 'Relationship References',
    'evidence.objectFragment': 'Object Mapping Fragment',
    'evidence.linkFragment': 'Link Mapping Fragment',
    'evidence.datasetSource': 'Dataset Source',
    'evidence.navigate': 'Navigate',

    'aiContext.title': 'AI Context',

    'import.title': 'Import an Ossie document',
    'import.close': 'Close',
    'import.textarea': 'Paste Ossie JSON or YAML',
    'import.placeholder': 'Paste a document, or drop a file here',
    'import.release': 'Release to load',
    'import.orChoose': 'Choose a file…',
    'import.formats': '.json · .yaml · .yml, parsed locally, never uploaded',
    'import.errorTitle': 'Cannot import, {count} problems',
    'import.errorMore': '{count} more not listed',
    'import.cancel': 'Cancel',
    'import.submit': 'Import',

    'json.eyebrow': 'SOURCE DOCUMENT',
    'json.title': 'Raw Ossie JSON',
    'json.titleYaml': 'Raw Ossie YAML',
    'json.readonly': 'read-only',
    'json.search': 'Search',
    'json.foldTop': 'Fold to top level',
    'json.unfoldAll': 'Unfold all',

    'issue.jsonSyntax': 'JSON syntax error: {message}',
    'issue.yamlSyntax': 'YAML syntax error: {message}',
    'issue.rootNotObject': 'The root node must be a JSON object.',
    'issue.versionMissing': 'Missing Ossie version.',
    'issue.nameMissing': 'Missing ontology name.',
    'issue.ontologyEmpty': '`ontology` must be a non-empty array.',
    'issue.conceptNameMissing': 'Concept has no name.',
    'issue.conceptTypeInvalid': 'Concept type must be EntityType or ValueType.',
    'issue.conceptDuplicate': 'Duplicate concept name: {name}',
    'issue.relationshipNameMissing': 'Relationship has no name.',
    'issue.relationshipDuplicate': 'Duplicate relationship name: {name}',
    'issue.verbalizesMissing': 'Relationship must provide `verbalizes`.',
    'issue.unknownParent': 'Unknown parent concept: {name}',
    'issue.unknownIdentity': 'Identity relationship does not exist: {name}',
    'issue.unknownRoleConcept': 'Unknown role concept: {name}',
    'issue.mappingWithoutModel': 'This ontology mapping has no semantic model attached.',
    'issue.unknownDataset': 'Unknown dataset: {name}',
    'issue.unknownMappedConcept': 'Mapping references an unknown concept: {name}',
    'issue.pureOntology': 'This is a pure ontology document; the semantic model and mapping views stay empty.',
  },
}

/** Chinese for any `zh-*` browser preference, English for everything else. */
export function detectLocale() {
  const preferences = typeof navigator === 'undefined'
    ? []
    : [navigator.language, ...(navigator.languages || [])]
  for (const preference of preferences) {
    if (typeof preference === 'string' && preference.toLowerCase().startsWith('zh')) return 'zh'
  }
  return 'en'
}

function storedLocale() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return LOCALES.includes(value) ? value : ''
  } catch {
    return ''
  }
}

export function translate(locale, key, params) {
  const template = MESSAGES[locale]?.[key] ?? MESSAGES.en[key] ?? key
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match))
}

/** Render one issue from `validateOssie` in the active language. */
export function issueText(issue, t) {
  return issue?.code ? t(issue.code, issue.params) : issue?.message || ''
}

const I18nContext = createContext(null)

export function I18nProvider({ children }) {
  // An explicit choice is remembered; otherwise the browser decides.
  const [locale, setLocale] = useState(() => storedLocale() || detectLocale())

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, locale)
    } catch {
      // A blocked storage quota must not take the app down.
    }
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
  }, [locale])

  const value = useMemo(
    () => ({ locale, setLocale, t: (key, params) => translate(locale, key, params) }),
    [locale],
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n must be used inside an I18nProvider')
  return value
}

export function useT() {
  return useI18n().t
}
