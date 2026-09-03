import { Handle, Position } from '@xyflow/react'
import { Braces, CircleDot, Database, GitBranch, Sigma } from 'lucide-react'
import {
  BaseNode,
  BaseNodeDescription,
  BaseNodeHeader,
  BaseNodeIcon,
  BaseNodeTitle,
} from './ui/base-node'
import { HANDLE_SIZE } from '../lib/graphGeometry'
import { useT } from '../lib/i18n'

const ICONS = {
  concept: CircleDot,
  valueType: Braces,
  dataset: Database,
  metric: Sigma,
  mapping: GitBranch,
}

const DEFAULT_TINT = 'text-green bg-green-soft'

export default function OssieNode({ data, selected }) {
  const Icon = ICONS[data.kind] || CircleDot
  const emphasis = selected
    ? 'selected'
    : data.related
      ? 'related'
      : data.dimmed
        ? 'dimmed'
        : 'default'
  const tooltip = [data.name, data.subtitle, data.description].filter(Boolean).join(' — ')
  const description = data.description || data.subtitle || '—'

  return (
    <BaseNode emphasis={emphasis} title={tooltip}>
      {(data.targetHandles || []).map((handle) => (
        <NodeHandle key={handle.id} type="target" handle={handle} data={data} />
      ))}
      <BaseNodeHeader>
        <BaseNodeIcon className={DEFAULT_TINT}>
          <Icon size={13} strokeWidth={2} />
        </BaseNodeIcon>
        <BaseNodeTitle title={data.name}>{data.name}</BaseNodeTitle>
      </BaseNodeHeader>
      <BaseNodeDescription title={description}>{description}</BaseNodeDescription>
      {(data.sourceHandles || []).map((handle) => (
        <NodeHandle key={handle.id} type="source" handle={handle} data={data} />
      ))}
    </BaseNode>
  )
}

function NodeHandle({ type, handle, data }) {
  const t = useT()
  const position = {
    top: Position.Top,
    right: Position.Right,
    bottom: Position.Bottom,
    left: Position.Left,
  }[handle.position]
  const style = ['top', 'bottom'].includes(handle.position)
    ? { left: `${handle.offset}%`, width: HANDLE_SIZE, height: HANDLE_SIZE }
    : { top: `${handle.offset}%`, width: HANDLE_SIZE, height: HANDLE_SIZE }
  const collapse = data.collapseHandles?.get(handle.id)
  const collapseLabel = collapse?.collapsed
    ? t('canvas.expandDescendants', { count: collapse.count })
    : t('canvas.collapseDescendants', { count: collapse?.count })
  const toggle = (event) => {
    event.stopPropagation()
    data.onToggleCollapse?.(handle.id)
  }
  return (
    <Handle
      id={handle.id}
      type={type}
      position={position}
      style={style}
      isConnectable={false}
      isConnectableStart={false}
      isConnectableEnd={false}
      className={`border-[1.5px] border-[#a5a5a5] bg-white opacity-100 shadow-[0_1px_2px_rgba(0,0,0,.08)] ${collapse ? `node-collapse-handle ${collapse.collapsed ? 'is-collapsed' : ''}` : ''}`}
      title={collapse ? collapseLabel : undefined}
      aria-label={collapse ? collapseLabel : undefined}
      aria-expanded={collapse ? !collapse.collapsed : undefined}
      role={collapse ? 'button' : undefined}
      tabIndex={collapse ? 0 : -1}
      onPointerDown={collapse ? (event) => event.stopPropagation() : undefined}
      onDoubleClick={collapse ? (event) => event.stopPropagation() : undefined}
      onClick={collapse ? toggle : undefined}
      onKeyDown={collapse ? (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        toggle(event)
      } : undefined}
    />
  )
}
