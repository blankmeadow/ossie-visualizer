import { ArrowRight, Braces, CircleDot, Database, GitBranch, KeyRound, Sigma, X } from 'lucide-react'
import { collectExpressionStrings, expressionText, referencedDatasets } from '../lib/ossie'

const KIND_META = {
  concept: { label: 'ONTOLOGY CONCEPT', Icon: CircleDot },
  relationship: { label: 'ONTOLOGY RELATIONSHIP', Icon: GitBranch },
  relationshipGroup: { label: 'RELATIONSHIP BUNDLE', Icon: GitBranch },
  inheritance: { label: 'ONTOLOGY INHERITANCE', Icon: GitBranch },
  dataset: { label: 'SEMANTIC DATASET', Icon: Database },
  field: { label: 'SEMANTIC FIELD', Icon: Braces },
  metric: { label: 'SEMANTIC METRIC', Icon: Sigma },
  semanticRelationship: { label: 'DATASET RELATIONSHIP', Icon: GitBranch },
  metricDependency: { label: 'METRIC DEPENDENCY', Icon: Sigma },
  mapping: { label: 'CONCEPT MAPPING', Icon: GitBranch },
  mappingEvidence: { label: 'MAPPING EVIDENCE', Icon: GitBranch },
}

export default function Inspector({ selection, model, onClose, onNavigate }) {
  if (!selection) {
    return (
      <aside className="inspector inspector--empty">
        <div className="inspector-empty__glyph"><CircleDot size={25} /></div>
        <h3>选择一个语义元素</h3>
        <p>从索引、搜索结果或关系图选择 Concept、Dataset、Metric 或 Mapping。</p>
      </aside>
    )
  }

  const meta = KIND_META[selection.kind] || KIND_META.concept
  const { Icon } = meta
  return (
    <aside className="inspector">
      <header className="inspector__header">
        <div className="inspector__symbol"><Icon size={17} /></div>
        <div>
          <span className="eyebrow">{meta.label}</span>
          <h2>{selection.name}</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="关闭详情"><X size={17} /></button>
      </header>
      <div className="inspector__body">
        {selection.kind === 'concept' && <ConceptDetail item={selection.target} model={model} onNavigate={onNavigate} />}
        {selection.kind === 'relationship' && <RelationshipDetail item={selection.target} model={model} onNavigate={onNavigate} />}
        {selection.kind === 'relationshipGroup' && <RelationshipGroupDetail item={selection.target} onNavigate={onNavigate} />}
        {selection.kind === 'inheritance' && <InheritanceDetail item={selection.target} onNavigate={onNavigate} />}
        {selection.kind === 'dataset' && <DatasetDetail item={selection.target} model={model} onNavigate={onNavigate} />}
        {selection.kind === 'field' && <FieldDetail item={selection.target} />}
        {selection.kind === 'metric' && <MetricDetail item={selection.target} model={model} onNavigate={onNavigate} />}
        {selection.kind === 'semanticRelationship' && <SemanticRelationshipDetail item={selection.target} model={model} onNavigate={onNavigate} />}
        {selection.kind === 'metricDependency' && <MetricDependencyDetail item={selection.target} onNavigate={onNavigate} />}
        {selection.kind === 'mapping' && <MappingDetail item={selection.target} model={model} onNavigate={onNavigate} />}
        {selection.kind === 'mappingEvidence' && <MappingEvidenceDetail item={selection.target} onNavigate={onNavigate} />}
      </div>
    </aside>
  )
}

function Section({ title, count, children }) {
  return (
    <section className="detail-section">
      <h3>{title}{count !== undefined && <span>{count}</span>}</h3>
      {children}
    </section>
  )
}

function Chips({ values, tone = 'plain' }) {
  if (!values?.length) return <span className="muted">—</span>
  return <div className="chips">{values.map((value) => <span className={`chip chip--${tone}`} key={value}>{value}</span>)}</div>
}

function RuleList({ values }) {
  if (!values?.length) return null
  return <div className="rule-list">{values.map((value) => <code key={value}>{value}</code>)}</div>
}

function LinkList({ items, onNavigate }) {
  if (!items.length) return <span className="muted">—</span>
  return (
    <div className="link-list">
      {items.map((item) => (
        <button key={`${item.kind}:${item.name}`} onClick={() => onNavigate(item)}>
          <span>{item.name}</span><ArrowRight size={14} />
        </button>
      ))}
    </div>
  )
}

function ConceptDetail({ item, model, onNavigate }) {
  const properties = (item.relationships || []).filter((relationship) =>
    relationship.roles?.length === 1 && ['String', 'Integer', 'Decimal', 'Float', 'Boolean', 'Date', 'DateTime'].includes(relationship.roles[0].concept),
  )
  const objectRelations = (item.relationships || []).filter((relationship) => !properties.includes(relationship))
  const inheritedBy = model.concepts.filter((concept) => concept.extends?.includes(item.concept))
  const mappings = model.conceptMappings.filter((mapping) => mapping.concept === item.concept)
  const datasetNames = new Set(model.datasets.map((dataset) => dataset.name))
  const datasets = [...new Set(mappings.flatMap((mapping) => referencedDatasets(mapping, datasetNames)))]
  const metrics = model.metrics.filter((metric) => {
    const text = collectExpressionStrings(metric).join(' ')
    return datasets.some((dataset) => text.includes(`${dataset}.`))
  })

  return (
    <>
      <p className="detail-description">{item.description || '暂无描述。'}</p>
      <div className="detail-kv">
        <div><span>类型</span><strong>{item.type}</strong></div>
        <div><span>身份关系</span><strong>{item.identify_by?.length || 0}</strong></div>
      </div>
      {!!item.extends?.length && <Section title="Extends"><Chips values={item.extends} tone="violet" /></Section>}
      {!!item.identify_by?.length && <Section title="Identify by"><Chips values={item.identify_by} tone="amber" /></Section>}
      {!!item.derived_by?.length && <Section title="Derived by"><RuleList values={item.derived_by} /></Section>}
      {!!item.requires?.length && <Section title="Requires"><RuleList values={item.requires} /></Section>}
      <Section title="属性" count={properties.length}>
        <LinkList
          items={properties.map((relationship) => ({ kind: 'relationship', name: `${item.concept}.${relationship.name}`, target: { ...relationship, owner: item.concept, path: `${item.concept}.${relationship.name}` } }))}
          onNavigate={onNavigate}
        />
      </Section>
      <Section title="对象与事实关系" count={objectRelations.length}>
        <LinkList
          items={objectRelations.map((relationship) => ({ kind: 'relationship', name: `${item.concept}.${relationship.name}`, target: { ...relationship, owner: item.concept, path: `${item.concept}.${relationship.name}` } }))}
          onNavigate={onNavigate}
        />
      </Section>
      {!!inheritedBy.length && <Section title="Extended by"><LinkList items={inheritedBy.map((concept) => ({ kind: 'concept', name: concept.concept, target: concept }))} onNavigate={onNavigate} /></Section>}
      <Section title="语义入口">
        <LinkList
          items={[
            ...datasets.map((name) => ({ kind: 'dataset', name, target: model.datasetByName.get(name) })),
            ...metrics.map((metric) => ({ kind: 'metric', name: metric.name, target: metric })),
          ]}
          onNavigate={onNavigate}
        />
      </Section>
    </>
  )
}

function RelationshipDetail({ item, model, onNavigate }) {
  const mappings = model.conceptMappings.filter((mapping) => mapping.concept === item.owner)
  const datasetNames = new Set(model.datasets.map((dataset) => dataset.name))
  const datasets = [...new Set(mappings.flatMap((mapping) => referencedDatasets(mapping, datasetNames)))]
  return (
    <>
      <p className="detail-description">{item.description || item.verbalizes?.[0] || '暂无描述。'}</p>
      <div className={`detail-kv ${item.multiplicity ? '' : 'detail-kv--single'}`}>
        <div><span>所属 Concept</span><strong>{item.owner}</strong></div>
        {item.multiplicity && <div><span>Multiplicity</span><strong>{item.multiplicity}</strong></div>}
      </div>
      <Section title="Roles" count={(item.roles || []).length + 1}>
        <div className="role-list">
          <div className="role-list__header" aria-hidden="true"><span /><span>Concept</span><span>Role name</span></div>
          <button onClick={() => onNavigate({ kind: 'concept', name: item.owner })}><KeyRound size={14} />{item.owner}<small>implicit first role</small></button>
          {(item.roles || []).map((role) => (
            <button key={`${role.concept}:${role.name || ''}`} onClick={() => onNavigate({ kind: 'concept', name: role.concept })}>
              <CircleDot size={14} />{role.concept}<small>{role.name || '—'}</small>
            </button>
          ))}
        </div>
      </Section>
      <Section title="Verbalizes"><RuleList values={item.verbalizes} /></Section>
      {!!item.derived_by?.length && <Section title="Derived by"><RuleList values={item.derived_by} /></Section>}
      {!!item.requires?.length && <Section title="Requires"><RuleList values={item.requires} /></Section>}
      {!!datasets.length && (
        <Section title="语义入口">
          <LinkList items={datasets.map((name) => ({ kind: 'dataset', name, target: model.datasetByName.get(name) }))} onNavigate={onNavigate} />
        </Section>
      )}
    </>
  )
}

function RelationshipGroupDetail({ item, onNavigate }) {
  const relationships = [...new Map((item.items || []).map((relationship) => [relationship.path, relationship])).values()]
  return (
    <>
      <p className="detail-description">这条连线合并了同一对 Concept 之间的多条关系。选择其中一条可查看完整角色、规则和语义入口。</p>
      <div className="detail-kv">
        <div><span>From</span><strong>{item.source}</strong></div>
        <div><span>To</span><strong>{item.target}</strong></div>
      </div>
      <Section title="Relationships" count={relationships.length}>
        <LinkList
          items={relationships.map((relationship) => ({ kind: 'relationship', name: relationship.path, target: relationship }))}
          onNavigate={onNavigate}
        />
      </Section>
    </>
  )
}

function InheritanceDetail({ item, onNavigate }) {
  return (
    <>
      <p className="detail-description"><code>{item.child}</code> 继承 <code>{item.parent}</code>，并获得父 Concept 的关系和约束语义。</p>
      <div className="detail-kv">
        <div><span>Child</span><strong>{item.child}</strong></div>
        <div><span>Parent</span><strong>{item.parent}</strong></div>
      </div>
      <Section title="Concepts">
        <LinkList items={[
          { kind: 'concept', name: item.child, target: item.childConcept },
          { kind: 'concept', name: item.parent, target: item.parentConcept },
        ]} onNavigate={onNavigate} />
      </Section>
      {!!item.childConcept?.derived_by?.length && <Section title="Child Derived by"><RuleList values={item.childConcept.derived_by} /></Section>}
      {!!item.childConcept?.requires?.length && <Section title="Child Requires"><RuleList values={item.childConcept.requires} /></Section>}
    </>
  )
}

function DatasetDetail({ item, model, onNavigate }) {
  const relatedRelationships = model.semanticRelationships.filter((relationship) => relationship.from === item.name || relationship.to === item.name)
  const relatedMetrics = model.metrics.filter((metric) => collectExpressionStrings(metric).some((expression) => expression.includes(`${item.name}.`)))
  return (
    <>
      <p className="detail-description">{item.description || '暂无描述。'}</p>
      <div className="source-card"><span>Source</span><code>{item.source || '未指定'}</code></div>
      <Section title="Fields" count={item.fields?.length || 0}>
        <div className="field-table">
          {(item.fields || []).map((field) => (
            <button key={field.name} onClick={() => onNavigate({ kind: 'field', name: `${item.name}.${field.name}`, target: { ...field, _dataset: item.name } })}>
              <span><strong>{field.name}</strong><small>{field.description || '—'}</small></span>
              <em>{field.datatype || 'unknown'}</em>
            </button>
          ))}
        </div>
      </Section>
      <Section title="Dataset Relationships" count={relatedRelationships.length}>
        <LinkList items={relatedRelationships.map((relationship) => ({ kind: 'semanticRelationship', name: relationship.name, target: relationship }))} onNavigate={onNavigate} />
      </Section>
      <Section title="Related Metrics" count={relatedMetrics.length}>
        <LinkList items={relatedMetrics.map((metric) => ({ kind: 'metric', name: metric.name, target: metric }))} onNavigate={onNavigate} />
      </Section>
      {item.ai_context && <Section title="AI Context"><AiContext value={item.ai_context} /></Section>}
    </>
  )
}

function FieldDetail({ item }) {
  return (
    <>
      <p className="detail-description">{item.description || '暂无描述。'}</p>
      <div className="detail-kv">
        <div><span>Dataset</span><strong>{item._dataset}</strong></div>
        <div><span>Datatype</span><strong>{item.datatype || 'unknown'}</strong></div>
      </div>
      <Section title="Expression"><pre className="expression-block">{expressionText(item.expression) || '—'}</pre></Section>
      {item.dimension && <Section title="Dimension"><pre className="expression-block">{JSON.stringify(item.dimension, null, 2)}</pre></Section>}
      {item.ai_context && <Section title="AI Context"><AiContext value={item.ai_context} /></Section>}
    </>
  )
}

function MetricDetail({ item, model, onNavigate }) {
  const datasets = referencedDatasets(item, new Set(model.datasets.map((dataset) => dataset.name)))
  return (
    <>
      <p className="detail-description">{item.description || '暂无描述。'}</p>
      <div className="detail-kv"><div><span>Datatype</span><strong>{item.datatype || 'unknown'}</strong></div><div><span>Datasets</span><strong>{datasets.length}</strong></div></div>
      <Section title="Expression"><pre className="expression-block">{expressionText(item.expression) || '—'}</pre></Section>
      <Section title="Referenced Datasets"><LinkList items={datasets.map((name) => ({ kind: 'dataset', name, target: model.datasetByName.get(name) }))} onNavigate={onNavigate} /></Section>
      {item.ai_context && <Section title="AI Context"><AiContext value={item.ai_context} /></Section>}
    </>
  )
}

function SemanticRelationshipDetail({ item, model, onNavigate }) {
  const pairs = (item.from_columns || []).map((column, index) => `${column} → ${(item.to_columns || [])[index] || '—'}`)
  return (
    <>
      <p className="detail-description">{item.description || item.ai_context?.instructions || '连接两个 Dataset 的语义关系。'}</p>
      <div className="detail-kv">
        <div><span>From</span><strong>{item.from}</strong></div>
        <div><span>To</span><strong>{item.to}</strong></div>
      </div>
      <Section title="Datasets">
        <LinkList items={[
          { kind: 'dataset', name: item.from, target: model.datasetByName.get(item.from) },
          { kind: 'dataset', name: item.to, target: model.datasetByName.get(item.to) },
        ]} onNavigate={onNavigate} />
      </Section>
      <Section title="Join Fields" count={pairs.length}><RuleList values={pairs} /></Section>
      {item.ai_context && <Section title="AI Context"><AiContext value={item.ai_context} /></Section>}
    </>
  )
}

function MetricDependencyDetail({ item, onNavigate }) {
  return (
    <>
      <p className="detail-description">该 Dataset 为指标表达式提供字段和事实数据。</p>
      <div className="detail-kv">
        <div><span>Dataset</span><strong>{item.dataset?.name}</strong></div>
        <div><span>Metric</span><strong>{item.metric?.name}</strong></div>
      </div>
      <Section title="Navigate">
        <LinkList items={[
          { kind: 'dataset', name: item.dataset?.name, target: item.dataset },
          { kind: 'metric', name: item.metric?.name, target: item.metric },
        ].filter((entry) => entry.name)} onNavigate={onNavigate} />
      </Section>
      <Section title="Metric Expression"><pre className="expression-block">{expressionText(item.metric?.expression) || '—'}</pre></Section>
    </>
  )
}

function MappingDetail({ item, model, onNavigate }) {
  const datasets = referencedDatasets(item, new Set(model.datasets.map((dataset) => dataset.name)))
  return (
    <>
      <p className="detail-description">本体 Concept 与逻辑语义模型之间的映射证据。</p>
      <div className="detail-kv"><div><span>Concept</span><strong>{item.concept}</strong></div><div><span>Mapping</span><strong>{item._mappingName}</strong></div></div>
      <Section title="Referenced Datasets"><LinkList items={datasets.map((name) => ({ kind: 'dataset', name, target: model.datasetByName.get(name) }))} onNavigate={onNavigate} /></Section>
      <Section title="Object Mappings" count={item.object_mappings?.length || 0}><pre className="expression-block expression-block--json">{JSON.stringify(item.object_mappings || [], null, 2)}</pre></Section>
      <Section title="Link Mappings" count={item.link_mappings?.length || 0}><pre className="expression-block expression-block--json">{JSON.stringify(item.link_mappings || [], null, 2)}</pre></Section>
    </>
  )
}

function MappingEvidenceDetail({ item, onNavigate }) {
  const conceptMapping = item.conceptMapping
  const datasetEvidence = item.type === 'dataset-mapping'
  const evidence = item.evidence
  const links = [
    { kind: 'mapping', name: conceptMapping.concept, target: conceptMapping },
    item.dataset && { kind: 'dataset', name: item.dataset.name, target: item.dataset },
  ].filter(Boolean)
  return (
    <>
      <p className="detail-description">
        {datasetEvidence
          ? '这条边只展示当前 Dataset 实际参与的 Object/Link Mapping 证据，不混入同一 Concept 的其他数据集。'
          : '这条边表示 Ontology Concept 选择了哪个 Concept Mapping；字段和关系证据位于下游的 Dataset 边。'}
      </p>
      <div className="detail-kv">
        <div><span>Ontology Concept</span><strong>{conceptMapping.concept}</strong></div>
        <div><span>{datasetEvidence ? 'Semantic Dataset' : 'Concept Mapping'}</span><strong>{item.dataset?.name || conceptMapping._mappingName}</strong></div>
      </div>
      {datasetEvidence ? (
        <>
          <div className="detail-kv">
            <div><span>Mapping</span><strong>{conceptMapping._mappingName}</strong></div>
            <div><span>Evidence Fragments</span><strong>{evidence?.fragmentCount || 0}</strong></div>
          </div>
          <Section title="Mapped Expressions" count={evidence?.expressions?.length || 0}>
            <RuleList values={evidence?.expressions} />
          </Section>
          {!!evidence?.relationships?.length && (
            <Section title="Relationship References" count={evidence.relationships.length}>
              <Chips values={evidence.relationships} tone="violet" />
            </Section>
          )}
          {!!evidence?.objectMappings?.length && (
            <Section title="Object Mapping Fragment" count={evidence.objectMappings.length}>
              <pre className="expression-block expression-block--json">{JSON.stringify(evidence.objectMappings, null, 2)}</pre>
            </Section>
          )}
          {!!evidence?.linkMappings?.length && (
            <Section title="Link Mapping Fragment" count={evidence.linkMappings.length}>
              <pre className="expression-block expression-block--json">{JSON.stringify(evidence.linkMappings, null, 2)}</pre>
            </Section>
          )}
          <Section title="Dataset Source"><pre className="expression-block">{item.dataset?.source || '—'}</pre></Section>
        </>
      ) : (
        <div className="detail-kv">
          <div><span>Object Mappings</span><strong>{conceptMapping.object_mappings?.length || 0}</strong></div>
          <div><span>Link Mappings</span><strong>{conceptMapping.link_mappings?.length || 0}</strong></div>
          <div><span>Referenced Datasets</span><strong>{item.referencedDatasets?.length || 0}</strong></div>
        </div>
      )}
      <Section title="Navigate"><LinkList items={links} onNavigate={onNavigate} /></Section>
    </>
  )
}

function AiContext({ value }) {
  if (typeof value === 'string') return <p className="context-copy">{value}</p>
  return (
    <div className="ai-context">
      {value.instructions && <p>{value.instructions}</p>}
      <Chips values={value.synonyms} tone="green" />
      {!!value.examples?.length && <RuleList values={value.examples} />}
    </div>
  )
}
