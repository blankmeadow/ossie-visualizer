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
    'h-[72px] w-[224px] overflow-visible rounded-[8px] border px-[11px] py-[9px]',
    'bg-white',
    'transition-[opacity,filter,border-color,box-shadow,transform] duration-150',
  ),
  {
    variants: {
      emphasis: {
        default: 'border-[1.5px] border-[#b9b9b9] shadow-[0_0_0_4px_rgba(0,0,0,.045),0_2px_5px_rgba(0,0,0,.10)]',
        selected: 'border-2 border-[#4f8f75] ring-2 ring-[#4f8f75]/20 shadow-[0_5px_14px_rgba(79,143,117,.24)] -translate-y-px z-30',
        related: 'border-[1.5px] border-[#a9a9a9] shadow-[0_0_0_4px_rgba(0,0,0,.045),0_3px_9px_rgba(0,0,0,.12)]',
        dimmed: 'border-[1.5px] border-[#c9c9c9] shadow-[0_2px_5px_rgba(0,0,0,.08)] opacity-[.48] saturate-[.45]',
      },
    },
    defaultVariants: { emphasis: 'default' },
  },
)

/** Hover lifts a node the same way selection does, but not while it is faded back. */
const hoverable = cn(
  'hover:border-[#a7a7a7] hover:shadow-[0_4px_11px_rgba(0,0,0,.14)] hover:-translate-y-px',
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
