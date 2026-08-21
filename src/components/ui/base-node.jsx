import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Shared shell for every node drawn on the graph canvas.
 *
 * Equivalent to the Base Node component in xyflow's React Flow UI registry,
 * written here because that registry is unreachable from this environment.
 * Same shape: a container plus header / title / content / footer slots, so a
 * new node type composes the pieces instead of restating the class soup.
 *
 * `emphasis` carries the canvas highlight states: the selection, its immediate
 * neighbours, and everything else faded back behind them.
 */

const baseNodeVariants = cva(
  cn(
    'h-[72px] w-[224px] overflow-visible rounded-[8px] border px-[11px] py-[9px]',
    'bg-white',
    // Opacity alone: it composites, so fading a large graph in and out of focus
    // stays cheap. A filter here would repaint every card on every pan frame.
    'transition-[opacity,border-color] duration-150',
  ),
  {
    variants: {
      emphasis: {
        default: 'border-[1.5px] border-[#b9b9b9]',
        selected: 'border-[1.5px] border-[#4f8f75] shadow-[0_0_0_6px_rgba(79,143,117,.12)] z-30',
        related: 'border-[1.5px] border-[#8fae9f]',
        dimmed: 'border-[1.5px] border-[#cdcdcd] opacity-40',
      },
    },
    defaultVariants: { emphasis: 'default' },
  },
)

function BaseNode({ className, emphasis = 'default', ...props }) {
  return (
    <div
      className={cn(
        baseNodeVariants({ emphasis }),
        className,
      )}
      {...props}
    />
  )
}

function BaseNodeHeader({ className, ...props }) {
  return <div className={cn('flex h-[20px] items-center gap-[6px] text-[#777]', className)} {...props} />
}

function BaseNodeHeaderTitle({ className, ...props }) {
  return (
    <span
      className={cn('font-sans text-[8px] font-semibold tracking-[.09em]', className)}
      {...props}
    />
  )
}

/** The square, tinted glyph that identifies what kind of thing the node is. */
function BaseNodeIcon({ className, ...props }) {
  return (
    <span
      className={cn('grid size-[20px] place-items-center rounded-[5px]', className)}
      {...props}
    />
  )
}

function BaseNodeContent({ className, ...props }) {
  return <div className={cn('mt-[7px] flex min-w-0 items-center gap-[8px]', className)} {...props} />
}

function BaseNodeTitle({ className, ...props }) {
  return (
    <div
      className={cn('min-w-0 flex-1 truncate font-sans text-[14px] leading-[18px] font-medium text-[#2d2d2d]', className)}
      {...props}
    />
  )
}

/** One dense line: the concept's type, or a dataset's physical source. */
function BaseNodeSubtitle({ className, ...props }) {
  return (
    <div
      className={cn('mt-[2px] h-[12px] truncate font-mono text-[8px] leading-[12px] text-muted', className)}
      {...props}
    />
  )
}

/**
 * Prose description. Wraps to two lines and clamps, so a long description stays
 * readable without letting one node dictate the height of its whole rank.
 */
function BaseNodeDescription({ className, ...props }) {
  return (
    <div
      className={cn(
        'mt-[4px] line-clamp-2 h-[24px] font-sans text-[9px] leading-[12px] text-[#666]',
        className,
      )}
      {...props}
    />
  )
}

function BaseNodeFooter({ className, ...props }) {
  return <div className={cn('flex max-w-[96px] flex-none justify-end gap-[3px] overflow-hidden', className)} {...props} />
}

function BaseNodeBadge({ className, ...props }) {
  return (
    <span
      className={cn(
        'flex-none rounded-[3px] bg-[#f1f1f1] px-[4px] py-[1px]',
        'font-mono text-[7px] leading-[10px] font-medium text-[#666]',
        className,
      )}
      {...props}
    />
  )
}

export {
  BaseNode,
  BaseNodeHeader,
  BaseNodeHeaderTitle,
  BaseNodeIcon,
  BaseNodeContent,
  BaseNodeTitle,
  BaseNodeSubtitle,
  BaseNodeDescription,
  BaseNodeFooter,
  BaseNodeBadge,
  baseNodeVariants,
}
