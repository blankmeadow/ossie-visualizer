import { Handle, Position } from '@xyflow/react'
import { Braces, CircleDot, Database, GitBranch, Sigma } from 'lucide-react'

const ICONS = {
  concept: CircleDot,
  valueType: Braces,
  dataset: Database,
  metric: Sigma,
  mapping: GitBranch,
}

export default function OssieNode({ data, selected }) {
  const Icon = ICONS[data.kind] || CircleDot
  return (
    <div className={`ossie-node ossie-node--${data.kind} ${selected ? 'is-selected' : ''} ${data.related ? 'is-related' : ''} ${data.dimmed ? 'is-dimmed' : ''}`}>
      {(data.targetHandles || []).map((handle) => <NodeHandle key={handle.id} type="target" handle={handle} />)}
      <div className="ossie-node__header">
        <span className="ossie-node__icon"><Icon size={15} strokeWidth={2} /></span>
        <span className="ossie-node__kind">{labelForKind(data.kind)}</span>
      </div>
      <div className="ossie-node__name" title={data.name}>{data.name}</div>
      <div className="ossie-node__subtitle" title={data.subtitle}>{data.subtitle || '—'}</div>
      {!!data.badges?.length && (
        <div className="ossie-node__badges">
          {data.badges.map((badge) => <span key={badge}>{badge}</span>)}
        </div>
      )}
      {(data.sourceHandles || []).map((handle) => <NodeHandle key={handle.id} type="source" handle={handle} />)}
    </div>
  )
}

function NodeHandle({ type, handle }) {
  const position = {
    top: Position.Top,
    right: Position.Right,
    bottom: Position.Bottom,
    left: Position.Left,
  }[handle.position]
  const style = ['top', 'bottom'].includes(handle.position)
    ? { left: `${handle.offset}%` }
    : { top: `${handle.offset}%` }
  return <Handle id={handle.id} type={type} position={position} style={style} className="ossie-node__handle" />
}

function labelForKind(kind) {
  return {
    concept: 'ENTITY TYPE',
    valueType: 'VALUE TYPE',
    dataset: 'DATASET',
    metric: 'METRIC',
    mapping: 'MAPPING',
  }[kind] || kind.toUpperCase()
}
