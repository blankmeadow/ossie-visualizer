import { lazy, Suspense, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Braces,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Database,
  FolderOpen,
  GitBranch,
  Languages,
  Layers3,
  Network,
  Search,
  Sigma,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react'
import GraphCanvas from './components/GraphCanvas'
import ImportDialog from './components/ImportDialog'
import Inspector from './components/Inspector'
import ResizeHandle from './components/ResizeHandle'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from './components/ui/dropdown-menu'
import { buildMappingGraph, buildOntologyGraph, buildSemanticGraph } from './lib/graph'
import { issueText, useI18n, useT } from './lib/i18n'
import { buildSearchIndex, normalizeOssie, parseOssie, relationshipKind, searchIndex } from './lib/ossie'
import { usePanelWidth } from './lib/usePanelWidth'

// `count` reports how much the tab actually holds; the tabs that are not a
// list of anything leave it off. `hideWhenEmpty` drops the semantic layers a
// pure ontology document simply does not have -- the ontology tab stays put
// even at zero, since it is what the document is.
const TABS = [
  { id: 'overview', labelKey: 'tab.overview', icon: Layers3 },
  { id: 'ontology', labelKey: 'tab.ontology', icon: Network, count: (model) => model.stats.entityTypes },
  { id: 'semantic', labelKey: 'tab.semantic', icon: Database, count: (model) => model.stats.datasets, hideWhenEmpty: true },
  { id: 'mapping', labelKey: 'tab.mapping', icon: GitBranch, count: (model) => model.stats.conceptMappings, hideWhenEmpty: true },
  { id: 'json', labelKey: 'tab.json', icon: Braces },
]

function visibleTabs(model) {
  return TABS.filter((tab) => !tab.hideWhenEmpty || tab.count(model) > 0)
}

const JsonView = lazy(() => import('./components/JsonView'))

// Ossie's own vocabulary, deliberately the same in both languages.
const KIND_LABELS = {
  concept: 'Entity Type',
  valueType: 'Value Type',
  relationship: 'Relationship',
  dataset: 'Dataset',
  field: 'Field',
  metric: 'Metric',
  mapping: 'Mapping',
}

export default function App() {
  const { locale, setLocale, t } = useI18n()
  const sidebar = usePanelWidth('sidebar')
  const inspector = usePanelWidth('inspector')
  const [model, setModel] = useState(null)
  const [source, setSource] = useState(null)
  const [warnings, setWarnings] = useState([])
  const [importErrors, setImportErrors] = useState([])
  const [importOpen, setImportOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [query, setQuery] = useState('')
  const [selection, setSelection] = useState(null)
  const [showRelationships, setShowRelationships] = useState(true)
  const [showMetrics, setShowMetrics] = useState(false)
  const [focusDepth, setFocusDepth] = useState(0)
  const [sidebarKind, setSidebarKind] = useState('all')

  const searchItems = useMemo(() => model ? buildSearchIndex(model) : [], [model])
  const sidebarKinds = sidebarKind !== 'all'
    ? [sidebarKind]
    : activeTab === 'ontology'
      // Value types are reached through the attribute table of the entity that
      // uses them, so the ontology index lists entity types alone.
      ? ['concept']
      : activeTab === 'semantic'
        ? query.trim() ? ['dataset', 'metric', 'field'] : ['dataset', 'metric']
        : activeTab === 'mapping'
          ? ['mapping']
          : []
  const sidebarItems = useMemo(
    () => searchIndex(searchItems, query, sidebarKinds),
    [searchItems, query, sidebarKinds.join(':')],
  )

  // A value type has no node on the canvas, so focusing on one would empty the
  // graph rather than narrow it.
  const selectedGraphName = selection?.kind === 'valueType'
    ? ''
    : selection?.kind === 'metric'
    ? `metric:${selection.name}`
    : selection?.kind === 'field'
      ? selection.target?._dataset || ''
      : selection?.kind === 'relationship'
        ? selection.target?.owner || ''
        : selection?.kind === 'relationshipGroup'
          ? selection.target?.source || ''
          : selection?.kind === 'semanticRelationship'
            ? selection.target?.from || ''
            : selection?.kind === 'metricDependency'
              ? `metric:${selection.target?.metric?.name || ''}`
              : selection?.kind === 'inheritance'
                ? selection.target?.child || ''
    : selection?.kind === 'mapping'
      ? `mapping:${selection.name}`
      : selection?.name || ''
  const selectedMapping = selection?.kind === 'mapping'
    ? selection.target
    : activeTab === 'mapping'
      ? model?.conceptMappings[0]
      : null

  const graph = useMemo(() => {
    if (!model) return { nodes: [], edges: [] }
    if (activeTab === 'ontology') {
      return buildOntologyGraph(model, {
        showRelationships,
        selectedName: selectedGraphName,
        depth: focusDepth,
      })
    }
    if (activeTab === 'semantic') {
      return buildSemanticGraph(model, {
        showMetrics,
        selectedName: selectedGraphName,
        depth: focusDepth,
      })
    }
    if (activeTab === 'mapping') return buildMappingGraph(model, selectedMapping)
    return { nodes: [], edges: [] }
  }, [model, activeTab, showRelationships, showMetrics, focusDepth, selectedGraphName, selectedMapping])

  const handleImport = (text) => {
    const result = parseOssie(text)
    if (result.errors.length) {
      setImportErrors(result.errors)
      return
    }
    setModel(normalizeOssie(result.document))
    // The source tab shows what was opened, in the language it was written in.
    setSource({ text, format: result.format })
    setWarnings(result.warnings)
    setImportErrors([])
    setImportOpen(false)
    setActiveTab('overview')
    setSelection(null)
    setQuery('')
    setSidebarKind('all')
  }

  const navigate = (next) => {
    if (!model || !next) return
    let item = next
    if (!next.target) {
      item = searchItems.find((candidate) => candidate.kind === next.kind && candidate.name === next.name)
      if (!item) return
    }
    const normalized = item.target ? item : { ...item, target: next.target }
    setSelection({ kind: normalized.kind, name: normalized.name, target: normalized.target })
    if (['concept', 'valueType', 'relationship'].includes(normalized.kind)) setActiveTab('ontology')
    if (normalized.kind === 'relationship') {
      setShowRelationships(true)
      // Only relationships that are actually drawn are worth focusing on; an
      // attribute has no edge, so focusing would blank the canvas.
      const kind = relationshipKind(normalized.target, model)
      if (kind === 'association' || kind === 'objectified') setFocusDepth(1)
    }
    if (['dataset', 'field', 'metric'].includes(normalized.kind)) {
      setActiveTab('semantic')
      if (normalized.kind === 'metric') setShowMetrics(true)
    }
    if (normalized.kind === 'mapping') setActiveTab('mapping')
  }

  const selectGraphElement = (next) => {
    if (!next) {
      setSelection(null)
      return
    }
    setSelection(next)
  }

  const selectTab = (tab) => {
    setActiveTab(tab)
    setQuery('')
    setSidebarKind('all')
    setFocusDepth(0)
    if (tab === 'mapping' && model?.conceptMappings.length) {
      const mapping = model.conceptMappings[0]
      setSelection({ kind: 'mapping', name: mapping.concept, target: mapping })
    } else {
      setSelection(null)
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand__mark"><Network size={20} /></div>
          <div><strong>Ossie Visualizer</strong></div>
        </div>
        <button
          className="button button--ghost topbar__locale"
          onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
          aria-label={t('locale.switch')}
          title={t('locale.switch')}
        >
          <Languages size={16} />{t('locale.label')}
        </button>
        <button className="button button--primary topbar__open" onClick={() => setImportOpen(true)}>
          <FolderOpen size={16} />{t('app.import')}
        </button>
      </header>

      {model && (
        <nav className="tabbar">
          {visibleTabs(model).map(({ id, labelKey, icon: Icon, count }) => (
            <button key={id} className={activeTab === id ? 'is-active' : ''} onClick={() => selectTab(id)}>
              <Icon size={15} />{t(labelKey)}
              {!!count && <em className="tabbar__count">{count(model)}</em>}
            </button>
          ))}
          <div className="tabbar__status"><CheckCircle2 size={14} />{t('app.statusOk')}</div>
        </nav>
      )}

      {!model ? (
        <Welcome onOpen={() => setImportOpen(true)} />
      ) : activeTab === 'overview' ? (
        <Overview model={model} warnings={warnings} onNavigate={navigate} onTab={selectTab} />
      ) : activeTab === 'json' ? (
        <Suspense fallback={<main className="json-view"><div className="json-view__loading">{t('app.jsonLoading')}</div></main>}>
          <JsonView source={source} />
        </Suspense>
      ) : (
        <main
          className="workspace"
          style={{ '--sidebar-width': `${sidebar.width}px`, '--inspector-width': `${inspector.width}px` }}
        >
          <Sidebar
            key={activeTab}
            activeTab={activeTab}
            items={sidebarItems}
            query={query}
            onQuery={setQuery}
            selectedKind={sidebarKind}
            onKind={setSidebarKind}
            selection={selection}
            onSelect={navigate}
            onResize={sidebar.resize}
            onResetWidth={sidebar.reset}
          />
          <section className="canvas-panel">
            <GraphToolbar
              activeTab={activeTab}
              model={model}
              showRelationships={showRelationships}
              setShowRelationships={setShowRelationships}
              showMetrics={showMetrics}
              setShowMetrics={setShowMetrics}
              focusDepth={focusDepth}
              setFocusDepth={setFocusDepth}
              selection={selection}
            />
            <GraphCanvas
              graph={graph}
              selection={selection}
              onSelect={selectGraphElement}
              onFocus={setFocusDepth}
              inspectorWidth={inspector.width}
            />
            <GraphLegend activeTab={activeTab} />
          </section>
          <Inspector
            selection={selection}
            model={model}
            onClose={() => setSelection(null)}
            onNavigate={navigate}
            onResize={inspector.resize}
            onResetWidth={inspector.reset}
          />
        </main>
      )}

      <ImportDialog
        open={importOpen}
        errors={importErrors}
        onClose={() => { setImportOpen(false); setImportErrors([]) }}
        onImport={handleImport}
      />
    </div>
  )
}

function Welcome({ onOpen }) {
  const t = useT()
  return (
    <main className="welcome">
      <div className="welcome__art">
        <span className="orbit orbit--one" />
        <span className="orbit orbit--two" />
        <span className="welcome-node welcome-node--a">Concept</span>
        <span className="welcome-node welcome-node--b">Relationship</span>
        <span className="welcome-node welcome-node--c">Dataset</span>
        <span className="welcome-node welcome-node--d">Metric</span>
        <Network size={40} />
      </div>
      <span className="eyebrow">APACHE OSSIE · LOCAL FIRST</span>
      <h1>{t('welcome.title')}</h1>
      <p>{t('welcome.body')}</p>
      <button className="button button--primary button--large" onClick={onOpen}><FolderOpen size={18} />{t('welcome.cta')}</button>
      <div className="welcome__features">
        <span><CheckCircle2 size={15} />{t('welcome.featureLocal')}</span>
        <span><CheckCircle2 size={15} />{t('welcome.featureCheck')}</span>
        <span><CheckCircle2 size={15} />{t('welcome.featureFlow')}</span>
      </div>
    </main>
  )
}

function Overview({ model, warnings, onNavigate, onTab }) {
  const t = useT()
  const stats = [
    ['overview.statEntityTypes', model.stats.entityTypes, CircleDot, 'ontology'],
    ['overview.statRelations', model.stats.associationRelationships, Network, 'ontology'],
    ['overview.statAttributes', model.stats.attributeRelationships, Braces, 'ontology'],
    ['overview.statDatasets', model.stats.datasets, Database, 'semantic'],
    ['overview.statMetrics', model.stats.metrics, Sigma, 'semantic'],
    ['overview.statMappings', model.stats.conceptMappings, GitBranch, 'mapping'],
  ]
  const mappedConcepts = new Set(model.conceptMappings.map((mapping) => mapping.concept))
  const unmapped = model.concepts.filter((concept) => !mappedConcepts.has(concept.concept))
  return (
    <main className="overview">
      <section className="overview__hero">
        <div>
          <span className="eyebrow">{t('overview.eyebrow')}</span>
          <h1>{model.document.name}</h1>
          <p>{model.document.description || t('overview.noDescription')}</p>
        </div>
        <div className="overview__health">
          <CheckCircle2 size={20} />
          <div><strong>{t('overview.healthTitle')}</strong><span>{t('overview.healthBody')}</span></div>
        </div>
      </section>
      {!!warnings.length && <div className="warning-banner"><AlertTriangle size={17} /><span>{issueText(warnings[0], t)}</span></div>}
      {/* Constraints the whole document asserts. They belong to no concept, so
          nothing else on screen would ever show them. */}
      {!!model.document.requires?.length && (
        <section className="overview-requires">
          <span className="eyebrow">{t('overview.requires')}</span>
          <div>{model.document.requires.map((rule) => <code key={rule}>{rule}</code>)}</div>
        </section>
      )}
      <section className="stat-grid">
        {stats.map(([labelKey, value, Icon, tab]) => (
          <button key={labelKey} onClick={() => onTab(tab)}>
            <span><Icon size={17} /></span><strong>{value}</strong><small>{t(labelKey)}</small><ChevronRight size={15} />
          </button>
        ))}
      </section>
      <section className="overview-grid">
        <article className="overview-card overview-card--large">
          <header>
            <div><span className="eyebrow">{t('overview.layersEyebrow')}</span><h2>{t('overview.layersTitle')}</h2></div>
            <Sparkles size={18} />
          </header>
          <div className="layer-flow">
            <button onClick={() => onTab('ontology')}><CircleDot size={19} /><strong>Ontology</strong><span>{t('overview.layerConcepts', { count: model.stats.entityTypes + model.stats.valueTypes })}</span></button>
            <ChevronRight />
            <button onClick={() => onTab('mapping')}><GitBranch size={19} /><strong>Mapping</strong><span>{t('overview.layerMaps', { count: model.stats.conceptMappings })}</span></button>
            <ChevronRight />
            <button onClick={() => onTab('semantic')}><Database size={19} /><strong>Semantic Model</strong><span>{t('overview.layerDatasets', { count: model.stats.datasets })}</span></button>
          </div>
        </article>
        <article className="overview-card">
          <header><div><span className="eyebrow">{t('overview.coverageEyebrow')}</span><h2>{t('overview.coverageTitle')}</h2></div></header>
          <div className="coverage-number">
            <strong>{model.concepts.length ? Math.round(mappedConcepts.size / model.concepts.length * 100) : 0}%</strong>
            <span>{t('overview.coverageUnit', { mapped: mappedConcepts.size, total: model.concepts.length })}</span>
          </div>
          <div className="progress"><span style={{ width: `${model.concepts.length ? mappedConcepts.size / model.concepts.length * 100 : 0}%` }} /></div>
          <p>{model.ontologyMappings.length ? t('overview.coverageNote', { count: unmapped.length }) : t('overview.coveragePure')}</p>
        </article>
        <article className="overview-card">
          <header><div><span className="eyebrow">{t('overview.quickEyebrow')}</span><h2>{t('overview.quickTitle')}</h2></div></header>
          <div className="quick-list">
            {model.concepts.filter((concept) => concept.type !== 'ValueType').slice(0, 5).map((concept) => (
              <button key={concept.concept} onClick={() => onNavigate({ kind: 'concept', name: concept.concept, target: concept })}><span>{concept.concept}</span><ChevronRight size={14} /></button>
            ))}
          </div>
        </article>
      </section>
    </main>
  )
}

function Sidebar({ activeTab, items, query, onQuery, selectedKind, onKind, selection, onSelect, onResize, onResetWidth }) {
  const t = useT()
  const title = activeTab === 'ontology'
    ? t('sidebar.titleOntology')
    : activeTab === 'semantic' ? t('sidebar.titleSemantic') : t('sidebar.titleMapping')
  // The ontology index holds one kind only, so it has nothing to filter by.
  const filterOptions = activeTab === 'semantic'
    ? [['all', t('sidebar.filterAll')], ['dataset', 'Dataset'], ['metric', 'Metric'], ['field', 'Field']]
    : []

  return (
    <aside className="sidebar">
      <div className="sidebar__title"><h2>{title}</h2></div>
      <label className="search-box">
        <Search size={15} />
        <input value={query} onChange={(event) => onQuery(event.target.value)} placeholder={t('sidebar.search')} />
      </label>
      <div className="sidebar__summary">
        <span>{t('sidebar.count', { count: items.length })}</span>
        {!!filterOptions.length && (
          <div className="sidebar__filter">
            <DropdownMenu>
              <DropdownMenuTrigger
                className={`sidebar__filter-trigger ${selectedKind !== 'all' ? 'is-active' : ''}`}
                aria-label={t('sidebar.filterAria')}
              >
                <SlidersHorizontal size={14} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" aria-label={t('sidebar.filterMenu')}>
                <DropdownMenuLabel>{t('sidebar.filterLabel')}</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={selectedKind} onValueChange={onKind}>
                  {filterOptions.map(([kind, label]) => (
                    <DropdownMenuRadioItem key={kind} value={kind}>{label}</DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
      <div className="sidebar__items">
        {items.map((item) => (
          <button key={item.id} className={selection?.kind === item.kind && selection?.name === item.name ? 'is-active' : ''} onClick={() => onSelect(item)}>
            <KindIcon kind={item.kind} />
            <span><strong>{item.name}</strong><small>{item.description || KIND_LABELS[item.kind]}</small></span>
            <em>{KIND_LABELS[item.kind]}</em>
          </button>
        ))}
        {!items.length && <div className="sidebar__empty">{t('sidebar.empty')}</div>}
      </div>
      <ResizeHandle label={t('layout.resizeSidebar')} onResize={onResize} onReset={onResetWidth} />
    </aside>
  )
}

function GraphToolbar(props) {
  const t = useT()
  const { activeTab, selection, focusDepth, setFocusDepth } = props
  return (
    <div className="graph-toolbar">
      <div className="graph-toolbar__actions">
        {activeTab === 'ontology' && <Toggle checked={props.showRelationships} onChange={props.setShowRelationships} label={t('toolbar.relationships')} />}
        {activeTab === 'semantic' && <Toggle checked={props.showMetrics} onChange={props.setShowMetrics} label={t('toolbar.metrics')} />}
        {activeTab !== 'mapping' && (
          <div className="depth-switch" title={selection ? t('toolbar.focusHint') : t('toolbar.focusHintEmpty')}>
            {[0, 1, 2].map((depth) => (
              <button
                key={depth}
                disabled={!selection && depth > 0}
                className={focusDepth === depth ? 'is-active' : ''}
                onClick={() => setFocusDepth(depth)}
              >
                {depth === 0 ? t('toolbar.depthAll') : t('toolbar.depthHops', { count: depth })}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Toggle({ checked, onChange, label }) {
  return <button className={`toggle ${checked ? 'is-active' : ''}`} onClick={() => onChange(!checked)}><span />{label}</button>
}

function GraphLegend({ activeTab }) {
  const t = useT()
  const entries = activeTab === 'ontology'
    ? [['legend-dot legend-dot--concept', t('legend.entityType')], ['legend-line legend-line--extends', t('legend.extends')], ['legend-line legend-line--relation', t('legend.relationship')]]
    : activeTab === 'semantic'
      ? [['legend-dot legend-dot--dataset', t('legend.dataset')], ['legend-dot legend-dot--metric', t('legend.metric')]]
      : [['legend-dot legend-dot--concept', t('legend.concept')], ['legend-dot legend-dot--mapping', t('legend.mapping')], ['legend-dot legend-dot--dataset', t('legend.dataset')]]
  return (
    <div className="graph-legend">
      {entries.map(([className, label]) => <span key={label}><i className={className} />{label}</span>)}
    </div>
  )
}

function KindIcon({ kind }) {
  const Icon = { concept: CircleDot, valueType: Braces, relationship: Network, dataset: Database, field: Braces, metric: Sigma, mapping: GitBranch }[kind] || CircleDot
  return <i className={`kind-icon kind-icon--${kind}`}><Icon size={14} /></i>
}
