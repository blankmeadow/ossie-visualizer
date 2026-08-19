import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Braces, CircleDot, Database, GitBranch, Sigma, X } from 'lucide-react'
import {
  collectExpressionStrings,
  conceptMembers,
  expressionText,
  referencedDatasets,
  relationshipKind,
  resolveValueBase,
  roleKind,
} from '../lib/ossie'
import { useT } from '../lib/i18n'
import ResizeHandle from './ResizeHandle'

const KIND_META = {
  concept: { labelKey: 'kind.entityType', Icon: CircleDot },
  valueType: { labelKey: 'kind.valueType', Icon: Braces },
  relationship: { Icon: GitBranch },
  relationshipGroup: { labelKey: 'kind.relationshipGroup', Icon: GitBranch },
  inheritance: { labelKey: 'kind.inheritance', Icon: GitBranch },
  dataset: { labelKey: 'kind.dataset', Icon: Database },
  field: { labelKey: 'kind.field', Icon: Braces },
  metric: { labelKey: 'kind.metric', Icon: Sigma },
  semanticRelationship: { labelKey: 'kind.semanticRelationship', Icon: GitBranch },
  metricDependency: { labelKey: 'kind.metricDependency', Icon: Sigma },
  mapping: { labelKey: 'kind.mapping', Icon: GitBranch },
  mappingEvidence: { labelKey: 'kind.mappingEvidence', Icon: GitBranch },
}

const RELATIONSHIP_KIND_KEYS = {
  attribute: 'relationship.kindAttribute',
  association: 'relationship.kindAssociation',
  objectified: 'relationship.kindObjectified',
  unary: 'relationship.kindUnary',
}

/** A value type arrives as a concept; it reads as its own kind of thing. */
function resolveKind(selection) {
  return selection.kind === 'concept' && selection.target?.type === 'ValueType'
    ? 'valueType'
    : selection.kind
}

/**
 * A relationship or a value type is a detail *of* the concept on screen, and
 * neither has a node on the canvas or a row in the index to get back from.
 * Those open over the panel, so closing returns the reader where they were.
 * An entity type is a different subject: it replaces the panel and the graph
 * follows the selection.
 */
const OVERLAY_KINDS = new Set(['relationship', 'valueType'])

function DetailHeader({ kind, name, target, model, onClose, closeLabel, CloseIcon = X }) {
  const t = useT()
  const meta = KIND_META[kind] || KIND_META.concept
  const { Icon } = meta
  // A relationship is labelled by what it actually is -- an attribute, an
  // entity relation, an objectified or a unary fact -- rather than by the
  // one word every relationship would share.
  const eyebrow = kind === 'relationship'
    ? t(RELATIONSHIP_KIND_KEYS[relationshipKind(target, model)])
    : t(meta.labelKey)
  const multiplicity = kind === 'relationship' ? target?.multiplicity : ''
  return (
    <header className="inspector__header">
      <div className="inspector__symbol"><Icon size={17} /></div>
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2 title={name}>
          {name}
          {!!multiplicity && <span className="chip chip--amber">{multiplicity}</span>}
        </h2>
      </div>
      <button className="icon-button" onClick={onClose} aria-label={closeLabel} title={closeLabel}>
        <CloseIcon size={17} />
      </button>
    </header>
  )
}

function DetailBody({ kind, target, model, onNavigate }) {
  return (
    <>
      {kind === 'concept' && <ConceptDetail item={target} model={model} onNavigate={onNavigate} />}
      {kind === 'valueType' && <ValueTypeDetail item={target} model={model} onNavigate={onNavigate} />}
      {kind === 'relationship' && <RelationshipDetail item={target} model={model} onNavigate={onNavigate} />}
      {kind === 'relationshipGroup' && <RelationshipGroupDetail item={target} onNavigate={onNavigate} />}
      {kind === 'inheritance' && <InheritanceDetail item={target} onNavigate={onNavigate} />}
      {kind === 'dataset' && <DatasetDetail item={target} model={model} onNavigate={onNavigate} />}
      {kind === 'field' && <FieldDetail item={target} />}
      {kind === 'metric' && <MetricDetail item={target} model={model} onNavigate={onNavigate} />}
      {kind === 'semanticRelationship' && <SemanticRelationshipDetail item={target} model={model} onNavigate={onNavigate} />}
      {kind === 'metricDependency' && <MetricDependencyDetail item={target} onNavigate={onNavigate} />}
      {kind === 'mapping' && <MappingDetail item={target} model={model} onNavigate={onNavigate} />}
      {kind === 'mappingEvidence' && <MappingEvidenceDetail item={target} onNavigate={onNavigate} />}
    </>
  )
}

/** The stacked panel a relationship or value type opens in. */
function DetailOverlay({ item, model, onClose, onOpen }) {
  const t = useT()
  useEffect(() => {
    const close = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])

  const kind = resolveKind(item)
  return (
    <div className="detail-overlay">
      <div className="detail-overlay__scrim" onClick={onClose} role="presentation" />
      <section className="detail-overlay__panel" role="dialog" aria-modal="true" aria-label={item.name}>
        <DetailHeader
          kind={kind}
          name={item.name}
          target={item.target}
          model={model}
          onClose={onClose}
          closeLabel={t('inspector.closeDetail')}
          CloseIcon={ArrowLeft}
        />
        <div className="inspector__body">
          <DetailBody kind={kind} target={item.target} model={model} onNavigate={onOpen} />
        </div>
      </section>
    </div>
  )
}

export default function Inspector({ selection, model, onClose, onNavigate, onResize, onResetWidth }) {
  const t = useT()
  const [overlay, setOverlay] = useState(null)
  const selectionKey = selection ? `${selection.kind}:${selection.name}` : ''
  // Choosing something else in the graph or the index replaces what the
  // overlay was a detail of, so it closes with it.
  useEffect(() => setOverlay(null), [selectionKey])

  const open = (item) => {
    if (!item) return
    if (OVERLAY_KINDS.has(resolveKind(item))) setOverlay(item)
    else onNavigate(item)
  }

  // The handle sits on the panel's left edge, so dragging left widens it.
  const handle = <ResizeHandle label={t('layout.resizeInspector')} direction={-1} onResize={onResize} onReset={onResetWidth} />
  if (!selection) {
    return (
      <aside className="inspector inspector--empty">
        {handle}
        <div className="inspector-empty__glyph"><CircleDot size={25} /></div>
        <h3>{t('inspector.emptyTitle')}</h3>
        <p>{t('inspector.emptyBody')}</p>
      </aside>
    )
  }

  const kind = resolveKind(selection)
  return (
    <aside className="inspector">
      {handle}
      <DetailHeader
        kind={kind}
        name={selection.name}
        target={selection.target}
        model={model}
        onClose={onClose}
        closeLabel={t('inspector.close')}
      />
      <div className="inspector__body">
        <DetailBody kind={kind} target={selection.target} model={model} onNavigate={open} />
      </div>
      {overlay && <DetailOverlay item={overlay} model={model} onClose={() => setOverlay(null)} onOpen={open} />}
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

/** Shared shell for the attribute, relationship and participant tables. */
function MemberTable({ headers, children }) {
  return (
    <div className={`member-table member-table--cols${headers.length}`}>
      <div className="member-table__header" aria-hidden="true">
        {headers.map((header) => <span key={header}>{header}</span>)}
      </div>
      {children}
    </div>
  )
}

/**
 * A row is one grid line of cells plus, when the author wrote one, the
 * description underneath it. A description is a sentence rather than a field,
 * so a column of its own would clip it to a few words; on its own line it gets
 * the panel's full width. Nothing else goes on that line -- `verbalizes` in
 * particular belongs to the relationship's own panel, a click away on the name.
 */
function MemberRow({ children, note }) {
  return (
    <div className="member-table__row">
      <div className="member-table__line">{children}</div>
      {!!note && <p className="member-table__note" title={note}>{note}</p>}
    </div>
  )
}

function Cell({ value, onClick, tone }) {
  const text = value || '—'
  if (!onClick) return <span className={`member-table__cell ${tone || ''}`} title={text}>{text}</span>
  return (
    <button className={`member-table__cell member-table__cell--link ${tone || ''}`} onClick={onClick} title={text}>
      {text}
    </button>
  )
}

/**
 * Where a concept name should take the reader: entity types and value types get
 * their own panel, built-ins have nothing to open.
 */
function conceptTarget(name, model) {
  const concept = model.conceptByName.get(name)
  if (!concept) return null
  return { kind: concept.type === 'ValueType' ? 'valueType' : 'concept', name, target: concept }
}

function relationshipTarget(member) {
  return {
    kind: 'relationship',
    name: member.path,
    target: { ...member.relationship, owner: member.owner, path: member.path },
  }
}

/**
 * What a role's target reads as in a table: a built-in stands alone, a named
 * value type also names the built-in it is founded on.
 */
function typeLabel(name, model, t) {
  const kind = roleKind(name, model)
  if (kind !== 'value') return name
  const base = resolveValueBase(name, model)
  if (!base) return `${name} (${t('concept.unresolvedType')})`
  return base === name ? name : `${name} (${base})`
}

function attributeTypes(member, model, t) {
  const roles = member.relationship.roles || []
  if (!roles.length) return []
  return roles.map((role) => ({ name: role.concept, label: typeLabel(role.concept, model, t) }))
}

/** Everything constraining one member, condensed to chips the row can hold. */
function constraintChips(member, concept, model, t) {
  const chips = []
  if (member.keyIndex >= 0) {
    // A compound identifier is ordered, so the position is part of the marker.
    chips.push((concept.identify_by || []).length > 1
      ? t('concept.keyIndexed', { index: member.keyIndex + 1 })
      : t('concept.key'))
  }
  if (member.relationship.multiplicity) chips.push(member.relationship.multiplicity)
  const requires = member.relationship.requires?.length || 0
  if (requires) chips.push(t('concept.requiresCount', { count: requires }))
  const facets = (member.relationship.roles || []).reduce((total, role) => {
    if (roleKind(role.concept, model) !== 'value') return total
    return total + (model.conceptByName.get(role.concept)?.requires?.length || 0)
  }, 0)
  if (facets) chips.push(t('concept.facetCount', { count: facets }))
  return chips
}

/** Split members into "declared here" and one section per ancestor. */
function groupMembers(members, t) {
  const groups = new Map()
  for (const member of members) {
    const key = member.inheritedFrom || ''
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: key ? t('concept.groupInherited', { name: key }) : t('concept.groupOwn'),
        items: [],
      })
    }
    groups.get(key).items.push(member)
  }
  return [...groups.values()]
}

function GroupedRows({ groups, renderRow }) {
  const captioned = groups.length > 1
  return groups.map((group) => (
    <div className="member-table__group" key={group.key || 'own'}>
      {captioned && <div className="member-table__caption">{group.label}</div>}
      {group.items.map(renderRow)}
    </div>
  ))
}


/**
 * The relationships other concepts declare against this one. A concept cannot
 * find these by looking at itself, and both an entity type and a value type
 * need the same answer, so both read it from `inboundByConcept`.
 */
function InboundTable({ entries, model, onNavigate }) {
  const t = useT()
  if (!entries.length) return <span className="muted">—</span>
  return (
    <MemberTable headers={[t('concept.colSource'), t('concept.colName')]}>
      {entries.map((entry) => (
        <MemberRow
          key={`${entry.path}:${entry.role.name || ''}`}
          note={entry.relationship.description}
        >
          <Cell
            value={entry.owner}
            onClick={conceptTarget(entry.owner, model)
              ? () => onNavigate(conceptTarget(entry.owner, model))
              : undefined}
          />
          <Cell
            value={entry.relationship.name}
            tone="member-table__cell--type"
            onClick={() => onNavigate({ kind: 'relationship', name: entry.path, target: entry.relationship })}
          />
        </MemberRow>
      ))}
    </MemberTable>
  )
}

function ConceptDetail({ item, model, onNavigate }) {
  const t = useT()
  const { attributes, associations, inbound } = conceptMembers(item, model)
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
      <p className="detail-description">{item.description || t('inspector.noDescription')}</p>
      {!!item.extends?.length && <Section title={t('concept.extends')}><Chips values={item.extends} tone="violet" /></Section>}
      {!!item.derived_by?.length && <Section title={t('concept.derivedBy')}><RuleList values={item.derived_by} /></Section>}
      {!!item.requires?.length && <Section title={t('concept.requires')}><RuleList values={item.requires} /></Section>}

      <Section title={t('concept.attributes')} count={attributes.length}>
        {attributes.length ? (
          <MemberTable headers={[t('concept.colName'), t('concept.colType'), t('concept.colConstraint')]}>
            <GroupedRows
              groups={groupMembers(attributes, t)}
              renderRow={(member) => {
                const types = attributeTypes(member, model, t)
                return (
                  <MemberRow key={member.path} note={member.relationship.description}>
                    <Cell value={member.name} onClick={() => onNavigate(relationshipTarget(member))} />
                    {types.length === 1 ? (
                      <Cell
                        value={types[0].label}
                        tone="member-table__cell--type"
                        onClick={conceptTarget(types[0].name, model)
                          ? () => onNavigate(conceptTarget(types[0].name, model))
                          : undefined}
                      />
                    ) : (
                      <Cell
                        value={types.map((type) => type.label).join(', ') || t('concept.noType')}
                        tone="member-table__cell--type"
                      />
                    )}
                    <span className="member-table__chips">
                      {constraintChips(member, item, model, t).map((chip) => (
                        <span className="chip chip--amber" key={chip}>{chip}</span>
                      ))}
                    </span>
                  </MemberRow>
                )
              }}
            />
          </MemberTable>
        ) : <span className="muted">—</span>}
      </Section>

      <Section title={t('concept.relations')} count={associations.length}>
        {associations.length ? (
          <MemberTable headers={[t('concept.colName'), t('concept.colTarget'), t('concept.colConstraint')]}>
            <GroupedRows
              groups={groupMembers(associations, t)}
              renderRow={(member) => {
                const targets = (member.relationship.roles || []).map((role) => role.concept)
                const first = targets[0]
                return (
                  <MemberRow key={member.path} note={member.relationship.description}>
                    <Cell value={member.name} onClick={() => onNavigate(relationshipTarget(member))} />
                    <Cell
                      value={targets.length > 1 ? targets.join(', ') : first}
                      tone="member-table__cell--type"
                      onClick={targets.length === 1 && conceptTarget(first, model)
                        ? () => onNavigate(conceptTarget(first, model))
                        : undefined}
                    />
                    <span className="member-table__chips">
                      {constraintChips(member, item, model, t).map((chip) => (
                        <span className="chip chip--amber" key={chip}>{chip}</span>
                      ))}
                    </span>
                  </MemberRow>
                )
              }}
            />
          </MemberTable>
        ) : <span className="muted">—</span>}
      </Section>

      <Section title={t('concept.inbound')} count={inbound.length}>
        <InboundTable entries={inbound} model={model} onNavigate={onNavigate} />
      </Section>

      {!!inheritedBy.length && (
        <Section title={t('concept.extendedBy')}>
          <LinkList items={inheritedBy.map((concept) => ({ kind: 'concept', name: concept.concept, target: concept }))} onNavigate={onNavigate} />
        </Section>
      )}
      <Section title={t('concept.semanticLinks')}>
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

function ValueTypeDetail({ item, model, onNavigate }) {
  const t = useT()
  const base = resolveValueBase(item.concept, model)
  const usedBy = model.inboundByConcept.get(item.concept) || []
  return (
    <>
      <p className="detail-description">{item.description || t('inspector.noDescription')}</p>
      <div className="detail-kv detail-kv--single">
        <div><span>{t('valueType.base')}</span><strong>{base || t('concept.unresolvedType')}</strong></div>
      </div>
      {!!item.extends?.length && <Section title={t('valueType.extends')}><Chips values={item.extends} tone="violet" /></Section>}
      {!!item.requires?.length && <Section title={t('valueType.requires')}><RuleList values={item.requires} /></Section>}
      <Section title={t('valueType.usedBy')} count={usedBy.length}>
        <InboundTable entries={usedBy} model={model} onNavigate={onNavigate} />
      </Section>
      {!!item.relationships?.length && (
        <Section title={t('valueType.relationships')} count={item.relationships.length}>
          <LinkList
            items={item.relationships.map((relationship) => ({
              kind: 'relationship',
              name: `${item.concept}.${relationship.name}`,
              target: { ...relationship, owner: item.concept, path: `${item.concept}.${relationship.name}` },
            }))}
            onNavigate={onNavigate}
          />
        </Section>
      )}
    </>
  )
}

function RelationshipDetail({ item, model, onNavigate }) {
  const t = useT()
  const mappings = model.conceptMappings.filter((mapping) => mapping.concept === item.owner)
  const datasetNames = new Set(model.datasets.map((dataset) => dataset.name))
  const datasets = [...new Set(mappings.flatMap((mapping) => referencedDatasets(mapping, datasetNames)))]
  const owner = model.conceptByName.get(item.owner)
  const participants = [
    {
      name: item.owner,
      description: owner?.description,
      role: t('relationship.implicitFirstRole'),
      implicit: true,
    },
    ...(item.roles || []).map((role) => ({
      name: role.concept,
      description: model.conceptByName.get(role.concept)?.description,
      role: role.name || '',
      implicit: false,
    })),
  ]

  return (
    <>
      <p className="detail-description">{item.description || t('inspector.noDescription')}</p>
      <Section title={t('relationship.participants')} count={participants.length}>
        <MemberTable headers={[t('relationship.colEntity'), t('relationship.colRole')]}>
          {participants.map((participant, index) => (
            <MemberRow key={`${participant.name}:${participant.role}:${index}`} note={participant.description}>
              <Cell
                value={participant.name}
                onClick={conceptTarget(participant.name, model)
                  ? () => onNavigate(conceptTarget(participant.name, model))
                  : undefined}
              />
              <Cell
                value={participant.role}
                tone={participant.implicit ? 'member-table__cell--muted' : 'member-table__cell--type'}
              />
            </MemberRow>
          ))}
        </MemberTable>
      </Section>
      <Section title={t('relationship.verbalizes')}><RuleList values={item.verbalizes} /></Section>
      {!!item.derived_by?.length && <Section title={t('relationship.derivedBy')}><RuleList values={item.derived_by} /></Section>}
      {!!item.requires?.length && <Section title={t('relationship.requires')}><RuleList values={item.requires} /></Section>}
      {!!datasets.length && (
        <Section title={t('concept.semanticLinks')}>
          <LinkList items={datasets.map((name) => ({ kind: 'dataset', name, target: model.datasetByName.get(name) }))} onNavigate={onNavigate} />
        </Section>
      )}
    </>
  )
}

function RelationshipGroupDetail({ item, onNavigate }) {
  const t = useT()
  const relationships = [...new Map((item.items || []).map((relationship) => [relationship.path, relationship])).values()]
  return (
    <>
      <p className="detail-description">{t('group.description')}</p>
      <div className="detail-kv">
        <div><span>{t('group.from')}</span><strong>{item.source}</strong></div>
        <div><span>{t('group.to')}</span><strong>{item.target}</strong></div>
      </div>
      <Section title={t('group.relationships')} count={relationships.length}>
        <LinkList
          items={relationships.map((relationship) => ({ kind: 'relationship', name: relationship.path, target: relationship }))}
          onNavigate={onNavigate}
        />
      </Section>
    </>
  )
}

function InheritanceDetail({ item, onNavigate }) {
  const t = useT()
  return (
    <>
      <p className="detail-description">{t('inheritance.description', { child: item.child, parent: item.parent })}</p>
      <div className="detail-kv">
        <div><span>{t('inheritance.child')}</span><strong>{item.child}</strong></div>
        <div><span>{t('inheritance.parent')}</span><strong>{item.parent}</strong></div>
      </div>
      <Section title={t('inheritance.concepts')}>
        <LinkList items={[
          { kind: 'concept', name: item.child, target: item.childConcept },
          { kind: 'concept', name: item.parent, target: item.parentConcept },
        ]} onNavigate={onNavigate} />
      </Section>
      {!!item.childConcept?.derived_by?.length && <Section title={t('inheritance.childDerivedBy')}><RuleList values={item.childConcept.derived_by} /></Section>}
      {!!item.childConcept?.requires?.length && <Section title={t('inheritance.childRequires')}><RuleList values={item.childConcept.requires} /></Section>}
    </>
  )
}

function DatasetDetail({ item, model, onNavigate }) {
  const t = useT()
  const relatedRelationships = model.semanticRelationships.filter((relationship) => relationship.from === item.name || relationship.to === item.name)
  const relatedMetrics = model.metrics.filter((metric) => collectExpressionStrings(metric).some((expression) => expression.includes(`${item.name}.`)))
  return (
    <>
      <p className="detail-description">{item.description || t('inspector.noDescription')}</p>
      <div className="source-card"><span>{t('dataset.source')}</span><code>{item.source || t('dataset.sourceUnknown')}</code></div>
      <Section title={t('dataset.fields')} count={item.fields?.length || 0}>
        <div className="field-table">
          {(item.fields || []).map((field) => (
            <button key={field.name} onClick={() => onNavigate({ kind: 'field', name: `${item.name}.${field.name}`, target: { ...field, _dataset: item.name } })}>
              <span><strong>{field.name}</strong><small>{field.description || '—'}</small></span>
              <em>{field.datatype || t('dataset.datatypeUnknown')}</em>
            </button>
          ))}
        </div>
      </Section>
      <Section title={t('dataset.relationships')} count={relatedRelationships.length}>
        <LinkList items={relatedRelationships.map((relationship) => ({ kind: 'semanticRelationship', name: relationship.name, target: relationship }))} onNavigate={onNavigate} />
      </Section>
      <Section title={t('dataset.metrics')} count={relatedMetrics.length}>
        <LinkList items={relatedMetrics.map((metric) => ({ kind: 'metric', name: metric.name, target: metric }))} onNavigate={onNavigate} />
      </Section>
      {item.ai_context && <Section title={t('aiContext.title')}><AiContext value={item.ai_context} /></Section>}
    </>
  )
}

function FieldDetail({ item }) {
  const t = useT()
  return (
    <>
      <p className="detail-description">{item.description || t('inspector.noDescription')}</p>
      <div className="detail-kv">
        <div><span>{t('field.dataset')}</span><strong>{item._dataset}</strong></div>
        <div><span>{t('field.datatype')}</span><strong>{item.datatype || t('dataset.datatypeUnknown')}</strong></div>
      </div>
      <Section title={t('field.expression')}><pre className="expression-block">{expressionText(item.expression) || '—'}</pre></Section>
      {item.dimension && <Section title={t('field.dimension')}><pre className="expression-block">{JSON.stringify(item.dimension, null, 2)}</pre></Section>}
      {item.ai_context && <Section title={t('aiContext.title')}><AiContext value={item.ai_context} /></Section>}
    </>
  )
}

function MetricDetail({ item, model, onNavigate }) {
  const t = useT()
  const datasets = referencedDatasets(item, new Set(model.datasets.map((dataset) => dataset.name)))
  return (
    <>
      <p className="detail-description">{item.description || t('inspector.noDescription')}</p>
      <div className="detail-kv">
        <div><span>{t('metric.datatype')}</span><strong>{item.datatype || t('dataset.datatypeUnknown')}</strong></div>
        <div><span>{t('metric.datasets')}</span><strong>{datasets.length}</strong></div>
      </div>
      <Section title={t('metric.expression')}><pre className="expression-block">{expressionText(item.expression) || '—'}</pre></Section>
      <Section title={t('metric.referenced')}><LinkList items={datasets.map((name) => ({ kind: 'dataset', name, target: model.datasetByName.get(name) }))} onNavigate={onNavigate} /></Section>
      {item.ai_context && <Section title={t('aiContext.title')}><AiContext value={item.ai_context} /></Section>}
    </>
  )
}

function SemanticRelationshipDetail({ item, model, onNavigate }) {
  const t = useT()
  const pairs = (item.from_columns || []).map((column, index) => `${column} → ${(item.to_columns || [])[index] || '—'}`)
  return (
    <>
      <p className="detail-description">{item.description || item.ai_context?.instructions || t('semanticRelationship.description')}</p>
      <div className="detail-kv">
        <div><span>{t('semanticRelationship.from')}</span><strong>{item.from}</strong></div>
        <div><span>{t('semanticRelationship.to')}</span><strong>{item.to}</strong></div>
      </div>
      <Section title={t('semanticRelationship.datasets')}>
        <LinkList items={[
          { kind: 'dataset', name: item.from, target: model.datasetByName.get(item.from) },
          { kind: 'dataset', name: item.to, target: model.datasetByName.get(item.to) },
        ]} onNavigate={onNavigate} />
      </Section>
      <Section title={t('semanticRelationship.joinFields')} count={pairs.length}><RuleList values={pairs} /></Section>
      {item.ai_context && <Section title={t('aiContext.title')}><AiContext value={item.ai_context} /></Section>}
    </>
  )
}

function MetricDependencyDetail({ item, onNavigate }) {
  const t = useT()
  return (
    <>
      <p className="detail-description">{t('metricDependency.description')}</p>
      <div className="detail-kv">
        <div><span>{t('metricDependency.dataset')}</span><strong>{item.dataset?.name}</strong></div>
        <div><span>{t('metricDependency.metric')}</span><strong>{item.metric?.name}</strong></div>
      </div>
      <Section title={t('metricDependency.navigate')}>
        <LinkList items={[
          { kind: 'dataset', name: item.dataset?.name, target: item.dataset },
          { kind: 'metric', name: item.metric?.name, target: item.metric },
        ].filter((entry) => entry.name)} onNavigate={onNavigate} />
      </Section>
      <Section title={t('metricDependency.expression')}><pre className="expression-block">{expressionText(item.metric?.expression) || '—'}</pre></Section>
    </>
  )
}

function MappingDetail({ item, model, onNavigate }) {
  const t = useT()
  const datasets = referencedDatasets(item, new Set(model.datasets.map((dataset) => dataset.name)))
  return (
    <>
      <p className="detail-description">{t('mapping.description')}</p>
      <div className="detail-kv">
        <div><span>{t('mapping.concept')}</span><strong>{item.concept}</strong></div>
        <div><span>{t('mapping.name')}</span><strong>{item._mappingName}</strong></div>
      </div>
      <Section title={t('mapping.referenced')}><LinkList items={datasets.map((name) => ({ kind: 'dataset', name, target: model.datasetByName.get(name) }))} onNavigate={onNavigate} /></Section>
      <Section title={t('mapping.objectMappings')} count={item.object_mappings?.length || 0}><pre className="expression-block expression-block--json">{JSON.stringify(item.object_mappings || [], null, 2)}</pre></Section>
      <Section title={t('mapping.linkMappings')} count={item.link_mappings?.length || 0}><pre className="expression-block expression-block--json">{JSON.stringify(item.link_mappings || [], null, 2)}</pre></Section>
    </>
  )
}

function MappingEvidenceDetail({ item, onNavigate }) {
  const t = useT()
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
        {datasetEvidence ? t('evidence.datasetDescription') : t('evidence.conceptDescription')}
      </p>
      <div className="detail-kv">
        <div><span>{t('evidence.ontologyConcept')}</span><strong>{conceptMapping.concept}</strong></div>
        <div>
          <span>{datasetEvidence ? t('evidence.semanticDataset') : t('evidence.conceptMapping')}</span>
          <strong>{item.dataset?.name || conceptMapping._mappingName}</strong>
        </div>
      </div>
      {datasetEvidence ? (
        <>
          <div className="detail-kv">
            <div><span>{t('evidence.mapping')}</span><strong>{conceptMapping._mappingName}</strong></div>
            <div><span>{t('evidence.fragments')}</span><strong>{evidence?.fragmentCount || 0}</strong></div>
          </div>
          <Section title={t('evidence.expressions')} count={evidence?.expressions?.length || 0}>
            <RuleList values={evidence?.expressions} />
          </Section>
          {!!evidence?.relationships?.length && (
            <Section title={t('evidence.relationships')} count={evidence.relationships.length}>
              <Chips values={evidence.relationships} tone="violet" />
            </Section>
          )}
          {!!evidence?.objectMappings?.length && (
            <Section title={t('evidence.objectFragment')} count={evidence.objectMappings.length}>
              <pre className="expression-block expression-block--json">{JSON.stringify(evidence.objectMappings, null, 2)}</pre>
            </Section>
          )}
          {!!evidence?.linkMappings?.length && (
            <Section title={t('evidence.linkFragment')} count={evidence.linkMappings.length}>
              <pre className="expression-block expression-block--json">{JSON.stringify(evidence.linkMappings, null, 2)}</pre>
            </Section>
          )}
          <Section title={t('evidence.datasetSource')}><pre className="expression-block">{item.dataset?.source || '—'}</pre></Section>
        </>
      ) : (
        <div className="detail-kv">
          <div><span>{t('mapping.objectMappings')}</span><strong>{conceptMapping.object_mappings?.length || 0}</strong></div>
          <div><span>{t('mapping.linkMappings')}</span><strong>{conceptMapping.link_mappings?.length || 0}</strong></div>
          <div><span>{t('mapping.referenced')}</span><strong>{item.referencedDatasets?.length || 0}</strong></div>
        </div>
      )}
      <Section title={t('evidence.navigate')}><LinkList items={links} onNavigate={onNavigate} /></Section>
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
