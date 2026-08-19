import { Handle, Position } from '@xyflow/react'
import { Braces, CircleDot, Database, GitBranch, Sigma } from 'lucide-react'
import {
  BaseNode,
  BaseNodeBadge,
  BaseNodeContent,
  BaseNodeFooter,
  BaseNodeHeader,
  BaseNodeHeaderTitle,
  BaseNodeIcon,
  BaseNodeSubtitle,
  BaseNodeTitle,
} from './ui/base-node'

const ICONS = {
  concept: CircleDot,
  valueType: Braces,
  dataset: Database,
  metric: Sigma,
  mapping: GitBranch,
}

const KIND_LABELS = {
  concept: 'ENTITY TYPE',
  valueType: 'VALUE TYPE',
  dataset: 'DATASET',
  metric: 'METRIC',
  mapping: 'MAPPING',
}

/** Icon tint per node kind; anything unmapped falls back to the concept green. */
const KIND_TINTS = {
  dataset: 'text-orange bg-orange-soft',
  metric: 'text-amber bg-amber-soft',
  mapping: 'text-violet bg-violet-soft',
}
const DEFAULT_TINT = 'text-green bg-green-soft'

export default function OssieNode({ data, selected }) {
  const Icon = ICONS[data.kind] || CircleDot
  const emphasis = selected ? 'selected' : data.dimmed ? 'dimmed' : data.related ? 'related' : 'default'

  return (
    <BaseNode emphasis={emphasis}>
      {(data.targetHandles || []).map((handle) => <NodeHandle key={handle.id} type="target" handle={handle} />)}
      <BaseNodeHeader>
        <BaseNodeIcon className={KIND_TINTS[data.kind] || DEFAULT_TINT}>
          <Icon size={15} strokeWidth={2} />
        </BaseNodeIcon>
        <BaseNodeHeaderTitle>{KIND_LABELS[data.kind] || data.kind.toUpperCase()}</BaseNodeHeaderTitle>
      </BaseNodeHeader>
      <BaseNodeContent>
        <BaseNodeTitle title={data.name}>{data.name}</BaseNodeTitle>
        <BaseNodeSubtitle title={data.subtitle}>{data.subtitle || '—'}</BaseNodeSubtitle>
      </BaseNodeContent>
      {!!data.badges?.length && (
        <BaseNodeFooter>
          {data.badges.map((badge) => <BaseNodeBadge key={badge}>{badge}</BaseNodeBadge>)}
        </BaseNodeFooter>
      )}
      {(data.sourceHandles || []).map((handle) => <NodeHandle key={handle.id} type="source" handle={handle} />)}
    </BaseNode>
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
  return (
    <Handle
      id={handle.id}
      type={type}
      position={position}
      style={style}
      className="size-[6px] border border-[#92aaa0] bg-[#fafffc] opacity-75"
    />
  )
}
