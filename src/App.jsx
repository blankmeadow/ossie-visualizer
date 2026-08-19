import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Braces,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Database,
  FolderOpen,
  GitBranch,
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
import { buildMappingGraph, buildOntologyGraph, buildSemanticGraph } from './lib/graph'
import { buildSearchIndex, normalizeOssie, parseOssie, searchIndex } from './lib/ossie'

const TABS = [
  { id: 'overview', label: '概览', icon: Layers3 },
  { id: 'ontology', label: '本体', icon: Network },
  { id: 'semantic', label: '语义模型', icon: Database },
  { id: 'mapping', label: '映射追踪', icon: GitBranch },
  { id: 'json', label: 'JSON', icon: Braces },
]

const JsonView = lazy(() => import('./components/JsonView'))

const KIND_LABELS = {
  concept: 'Concept',
  relationship: 'Relationship',
  dataset: 'Dataset',
  field: 'Field',
  metric: 'Metric',
  mapping: 'Mapping',
}

export default function App() {
  const [model, setModel] = useState(null)
  const [fileName, setFileName] = useState('')
  const [warnings, setWarnings] = useState([])
  const [importErrors, setImportErrors] = useState([])
  const [importOpen, setImportOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [query, setQuery] = useState('')
  const [selection, setSelection] = useState(null)
  const [showRelationships, setShowRelationships] = useState(true)
  const [showValueTypes, setShowValueTypes] = useState(true)
  const [showMetrics, setShowMetrics] = useState(false)
  const [focusDepth, setFocusDepth] = useState(0)
  const [sidebarKind, setSidebarKind] = useState('all')

  const searchItems = useMemo(() => model ? buildSearchIndex(model) : [], [model])
  const sidebarKinds = sidebarKind !== 'all'
    ? [sidebarKind]
    : activeTab === 'ontology'
      ? ['concept', 'relationship']
      : activeTab === 'semantic'
        ? query.trim() ? ['dataset', 'metric', 'field'] : ['dataset', 'metric']
        : activeTab === 'mapping'
          ? ['mapping']
          : []
  const sidebarItems = useMemo(
    () => searchIndex(searchItems, query, sidebarKinds),
    [searchItems, query, sidebarKinds.join(':')],
  )

  const selectedGraphName = selection?.kind === 'metric'
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
        showValueTypes,
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
  }, [model, activeTab, showRelationships, showValueTypes, showMetrics, focusDepth, selectedGraphName, selectedMapping])

  const handleImport = (text, name) => {
    const result = parseOssie(text)
    if (result.errors.length) {
      setImportErrors(result.errors)
      return
    }
    setModel(normalizeOssie(result.document))
    setFileName(name)
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
    if (normalized.kind === 'concept' || normalized.kind === 'relationship') setActiveTab('ontology')
    if (normalized.kind === 'relationship') {
      setShowRelationships(true)
      setFocusDepth(1)
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
          <div><strong>Ossie Visualizer</strong><span>Ontology workbench</span></div>
        </div>
        {model && (
          <div className="document-identity">
            <span className="status-dot" />
            <div><strong>{model.document.name}</strong><span>{fileName} · v{model.document.version}</span></div>
          </div>
        )}
        <button className="button button--primary topbar__open" onClick={() => setImportOpen(true)}>
          <FolderOpen size={16} />{model ? '更换 JSON' : '打开 JSON'}
        </button>
      </header>

      {model && (
        <nav className="tabbar">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} className={activeTab === id ? 'is-active' : ''} onClick={() => selectTab(id)}>
              <Icon size={15} />{label}
            </button>
          ))}
          <div className="tabbar__status"><CheckCircle2 size={14} />结构检查通过</div>
        </nav>
      )}

      {!model ? (
        <Welcome onOpen={() => setImportOpen(true)} />
      ) : activeTab === 'overview' ? (
        <Overview model={model} warnings={warnings} onNavigate={navigate} onTab={selectTab} />
      ) : activeTab === 'json' ? (
        <Suspense fallback={<main className="json-view"><div className="json-view__loading">正在加载 JSON 查看器…</div></main>}>
          <JsonView document={model.document} />
        </Suspense>
      ) : (
        <main className="workspace">
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
          />
          <section className="canvas-panel">
            <GraphToolbar
              activeTab={activeTab}
              model={model}
              showRelationships={showRelationships}
              setShowRelationships={setShowRelationships}
              showValueTypes={showValueTypes}
              setShowValueTypes={setShowValueTypes}
              showMetrics={showMetrics}
              setShowMetrics={setShowMetrics}
              focusDepth={focusDepth}
              setFocusDepth={setFocusDepth}
              selection={selection}
            />
            <GraphCanvas graph={graph} selection={selection} onSelect={selectGraphElement} onFocus={setFocusDepth} />
            <GraphLegend activeTab={activeTab} />
          </section>
          <Inspector selection={selection} model={model} onClose={() => setSelection(null)} onNavigate={navigate} />
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
      <h1>看清本体，也看清语义如何连接</h1>
      <p>导入任意 Ossie JSON，在一套工作台中浏览 Concept、关系、Semantic Model 与 Mapping。纯 Ontology 文档同样支持。</p>
      <button className="button button--primary button--large" onClick={onOpen}><FolderOpen size={18} />打开 Ossie JSON</button>
      <div className="welcome__features">
        <span><CheckCircle2 size={15} />本地解析</span>
        <span><CheckCircle2 size={15} />引用检查</span>
        <span><CheckCircle2 size={15} />React Flow</span>
      </div>
    </main>
  )
}

function Overview({ model, warnings, onNavigate, onTab }) {
  const stats = [
    ['Entity Types', model.stats.entityTypes, CircleDot, 'ontology'],
    ['Ontology Relations', model.stats.ontologyRelationships, Network, 'ontology'],
    ['Datasets', model.stats.datasets, Database, 'semantic'],
    ['Fields', model.stats.fields, Braces, 'semantic'],
    ['Metrics', model.stats.metrics, Sigma, 'semantic'],
    ['Concept Mappings', model.stats.conceptMappings, GitBranch, 'mapping'],
  ]
  const mappedConcepts = new Set(model.conceptMappings.map((mapping) => mapping.concept))
  const unmapped = model.concepts.filter((concept) => !mappedConcepts.has(concept.concept))
  return (
    <main className="overview">
      <section className="overview__hero">
        <div>
          <span className="eyebrow">ONTOLOGY OVERVIEW</span>
          <h1>{model.document.name}</h1>
          <p>{model.document.description || '暂无文档描述。'}</p>
        </div>
        <div className="overview__health"><CheckCircle2 size={20} /><div><strong>文档可用</strong><span>结构与交叉引用检查通过</span></div></div>
      </section>
      {!!warnings.length && <div className="warning-banner"><AlertTriangle size={17} /><span>{warnings[0].message}</span></div>}
      <section className="stat-grid">
        {stats.map(([label, value, Icon, tab]) => (
          <button key={label} onClick={() => onTab(tab)}>
            <span><Icon size={17} /></span><strong>{value}</strong><small>{label}</small><ChevronRight size={15} />
          </button>
        ))}
      </section>
      <section className="overview-grid">
        <article className="overview-card overview-card--large">
          <header><div><span className="eyebrow">MODEL LAYERS</span><h2>语义分层</h2></div><Sparkles size={18} /></header>
          <div className="layer-flow">
            <button onClick={() => onTab('ontology')}><CircleDot size={19} /><strong>Ontology</strong><span>{model.stats.entityTypes + model.stats.valueTypes} concepts</span></button>
            <ChevronRight />
            <button onClick={() => onTab('mapping')}><GitBranch size={19} /><strong>Mapping</strong><span>{model.stats.conceptMappings} concept maps</span></button>
            <ChevronRight />
            <button onClick={() => onTab('semantic')}><Database size={19} /><strong>Semantic Model</strong><span>{model.stats.datasets} datasets</span></button>
          </div>
        </article>
        <article className="overview-card">
          <header><div><span className="eyebrow">MAPPING SIGNAL</span><h2>映射覆盖</h2></div></header>
          <div className="coverage-number"><strong>{model.concepts.length ? Math.round(mappedConcepts.size / model.concepts.length * 100) : 0}%</strong><span>{mappedConcepts.size} / {model.concepts.length} concepts</span></div>
          <div className="progress"><span style={{ width: `${model.concepts.length ? mappedConcepts.size / model.concepts.length * 100 : 0}%` }} /></div>
          <p>{model.ontologyMappings.length ? `${unmapped.length} 个 Concept 没有直接 Mapping；派生 Concept 可能继承父级映射。` : '纯 Ontology 文档不要求提供 Mapping。'}</p>
        </article>
        <article className="overview-card">
          <header><div><span className="eyebrow">QUICK START</span><h2>快速进入</h2></div></header>
          <div className="quick-list">
            {model.concepts.slice(0, 5).map((concept) => (
              <button key={concept.concept} onClick={() => onNavigate({ kind: 'concept', name: concept.concept, target: concept })}><span>{concept.concept}</span><ChevronRight size={14} /></button>
            ))}
          </div>
        </article>
      </section>
    </main>
  )
}

function Sidebar({ activeTab, items, query, onQuery, selectedKind, onKind, selection, onSelect }) {
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filterRef = useRef(null)
  const title = activeTab === 'ontology' ? 'Ontology Index' : activeTab === 'semantic' ? 'Semantic Index' : 'Mapping Directory'
  const filterOptions = activeTab === 'ontology'
    ? [['all', '全部'], ['concept', 'Concept'], ['relationship', 'Relationship']]
    : activeTab === 'semantic'
      ? [['all', '全部'], ['dataset', 'Dataset'], ['metric', 'Metric'], ['field', 'Field']]
      : []

  useEffect(() => {
    if (!filtersOpen) return undefined
    const closeOnOutsideClick = (event) => {
      if (!filterRef.current?.contains(event.target)) setFiltersOpen(false)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setFiltersOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [filtersOpen])

  return (
    <aside className="sidebar">
      <div className="sidebar__title"><span className="eyebrow">BROWSE</span><h2>{title}</h2></div>
      <label className="search-box"><Search size={15} /><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="搜索名称、描述、同义词…" /></label>
      <div className="sidebar__summary">
        <span>{items.length} items</span>
        {!!filterOptions.length && (
          <div className="sidebar__filter" ref={filterRef}>
            <button
              type="button"
              className={`sidebar__filter-trigger ${selectedKind !== 'all' ? 'is-active' : ''}`}
              aria-label="筛选索引类型"
              aria-haspopup="menu"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <SlidersHorizontal size={14} />
            </button>
            {filtersOpen && (
              <div className="sidebar__filter-menu" role="menu" aria-label="索引类型">
                <span>类型</span>
                {filterOptions.map(([kind, label]) => (
                  <button
                    key={kind}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selectedKind === kind}
                    className={selectedKind === kind ? 'is-active' : ''}
                    onClick={() => {
                      onKind(kind)
                      setFiltersOpen(false)
                    }}
                  >
                    {label}{selectedKind === kind && <Check size={13} />}
                  </button>
                ))}
              </div>
            )}
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
        {!items.length && <div className="sidebar__empty">没有匹配结果</div>}
      </div>
    </aside>
  )
}

function GraphToolbar(props) {
  const { activeTab, selection, focusDepth, setFocusDepth } = props
  return (
    <div className="graph-toolbar">
      <div className="graph-toolbar__title">
        <span className="eyebrow">GRAPH VIEW</span>
        <strong>{activeTab === 'ontology' ? '概念与关系' : activeTab === 'semantic' ? '数据集语义图' : 'Concept 映射路径'}</strong>
        <small>{selection ? selection.name : '全局总览 · 双击节点进入一跳聚焦'}</small>
      </div>
      <div className="graph-toolbar__actions">
        {activeTab === 'ontology' && <><Toggle checked={props.showRelationships} onChange={props.setShowRelationships} label="对象关系" /><Toggle checked={props.showValueTypes} onChange={props.setShowValueTypes} label="ValueType" /></>}
        {activeTab === 'semantic' && <Toggle checked={props.showMetrics} onChange={props.setShowMetrics} label="Metrics" />}
        {activeTab !== 'mapping' && (
          <div className="depth-switch" title={selection ? '按当前选择聚焦' : '选择节点后可聚焦'}>
            {[0, 1, 2].map((depth) => <button key={depth} disabled={!selection && depth > 0} className={focusDepth === depth ? 'is-active' : ''} onClick={() => setFocusDepth(depth)}>{depth === 0 ? '全图' : `${depth} 跳`}</button>)}
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
  return (
    <div className="graph-legend">
      {activeTab === 'ontology' ? <><span><i className="legend-dot legend-dot--concept" />EntityType</span><span><i className="legend-line legend-line--extends" />extends</span><span><i className="legend-line legend-line--relation" />relationship</span></> : activeTab === 'semantic' ? <><span><i className="legend-dot legend-dot--dataset" />Dataset</span><span><i className="legend-dot legend-dot--metric" />Metric</span></> : <><span><i className="legend-dot legend-dot--concept" />Concept</span><span><i className="legend-dot legend-dot--mapping" />Mapping</span><span><i className="legend-dot legend-dot--dataset" />Dataset</span></>}
    </div>
  )
}

function KindIcon({ kind }) {
  const Icon = { concept: CircleDot, relationship: Network, dataset: Database, field: Braces, metric: Sigma, mapping: GitBranch }[kind] || CircleDot
  return <i className={`kind-icon kind-icon--${kind}`}><Icon size={14} /></i>
}
