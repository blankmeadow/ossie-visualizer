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
 * `emphasis` carries the three-way highlight the canvas drives when something
 * is selected: the selection itself, its immediate neighbours, and everything
 * else faded back.
 */

const baseNodeVariants = cva(
  cn(
    'w-[248px] min-h-[136px] rounded-[11px] border px-[13px] py-[12px]',
    'bg-[rgba(252,253,250,.98)]',
    'transition-[opacity,filter,border-color,box-shadow,transform] duration-150',
  ),
  {
    variants: {
      emphasis: {
        default: 'border-[#c9d5cf] shadow-[0_8px_22px_rgba(30,50,42,.10)]',
        selected: 'border-[#56816e] shadow-[0_12px_30px_rgba(30,70,55,.18)] -translate-y-px',
        related: 'border-[#9ab4a8] shadow-[0_8px_24px_rgba(30,70,55,.12)]',
        dimmed: 'border-[#c9d5cf] shadow-[0_8px_22px_rgba(30,50,42,.10)] opacity-[.16] saturate-[.35]',
      },
    },
    defaultVariants: { emphasis: 'default' },
  },
)

/** Hover lifts a node the same way selection does, but not while it is faded back. */
const hoverable = cn(
  'hover:border-[#56816e] hover:shadow-[0_12px_30px_rgba(30,70,55,.18)] hover:-translate-y-px',
)

function BaseNode({ className, emphasis = 'default', ...props }) {
  return (
    <div
      className={cn(
        baseNodeVariants({ emphasis }),
        emphasis !== 'dimmed' && hoverable,
        className,
      )}
      {...props}
    />
  )
}

function BaseNodeHeader({ className, ...props }) {
  return <div className={cn('flex items-center gap-[5px] text-[#7d8984]', className)} {...props} />
}

function BaseNodeHeaderTitle({ className, ...props }) {
  return (
    <span
      className={cn('font-mono text-micro font-medium tracking-[.08em]', className)}
      {...props}
    />
  )
}

/** The square, tinted glyph that identifies what kind of thing the node is. */
function BaseNodeIcon({ className, ...props }) {
  return (
    <span
      className={cn('grid size-[21px] place-items-center rounded-[6px]', className)}
      {...props}
    />
  )
}

function BaseNodeContent({ className, ...props }) {
  return <div className={cn('mt-[7px]', className)} {...props} />
}

function BaseNodeTitle({ className, ...props }) {
  return (
    <div
      className={cn('truncate font-mono text-base font-medium text-[#21312b]', className)}
      {...props}
    />
  )
}

/** One dense line: the concept's type, or a dataset's physical source. */
function BaseNodeSubtitle({ className, ...props }) {
  return (
    <div
      className={cn('mt-[4px] h-[14px] truncate font-mono text-tiny text-muted', className)}
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
        'mt-[5px] line-clamp-2 min-h-[26px] text-tiny leading-[1.45] text-[#5b6a63]',
        className,
      )}
      {...props}
    />
  )
}

function BaseNodeFooter({ className, ...props }) {
  return <div className={cn('mt-[7px] flex gap-[4px]', className)} {...props} />
}

function BaseNodeBadge({ className, ...props }) {
  return (
    <span
      className={cn(
        'rounded-[4px] bg-[#eef1ec] px-[5px] py-[2px]',
        'font-mono text-[7px] font-medium text-[#5e6e67]',
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
