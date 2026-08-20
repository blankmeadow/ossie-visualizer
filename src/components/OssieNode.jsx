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

const DEFAULT_TINT = 'text-green bg-green-soft'

export default function OssieNode({ data, selected }) {
  const Icon = ICONS[data.kind] || CircleDot
  const emphasis = selected ? 'selected' : data.dimmed ? 'dimmed' : data.related ? 'related' : 'default'
  const tooltip = [data.name, data.subtitle, data.description].filter(Boolean).join(' — ')

  return (
    <BaseNode emphasis={emphasis} title={tooltip}>
      {(data.targetHandles || []).map((handle) => <NodeHandle key={handle.id} type="target" handle={handle} />)}
      <BaseNodeHeader>
        <BaseNodeIcon className={DEFAULT_TINT}>
          <Icon size={13} strokeWidth={2} />
        </BaseNodeIcon>
        <BaseNodeHeaderTitle>{KIND_LABELS[data.kind] || data.kind.toUpperCase()}</BaseNodeHeaderTitle>
      </BaseNodeHeader>
      <BaseNodeContent>
        <BaseNodeTitle title={data.name}>{data.name}</BaseNodeTitle>
        {!!data.badges?.length && (
          <BaseNodeFooter title={data.badges.join(' · ')}>
            {data.badges.map((badge) => <BaseNodeBadge key={badge}>{badge}</BaseNodeBadge>)}
          </BaseNodeFooter>
        )}
      </BaseNodeContent>
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
      className="size-[10px] border-[1.5px] border-[#a5a5a5] bg-white opacity-100 shadow-[0_1px_2px_rgba(0,0,0,.08)]"
    />
  )
}
