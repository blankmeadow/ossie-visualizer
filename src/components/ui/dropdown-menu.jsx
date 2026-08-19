import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Dropdown menu built on Radix primitives, in the shadcn/ui idiom: the
 * primitive supplies behaviour (focus trapping, arrow-key roving, typeahead,
 * focus restore on close, outside/Escape dismissal), this file supplies the
 * styling and the project owns both.
 *
 * Written by hand rather than pulled with `npx shadcn add` because this
 * environment's egress policy blocks the component registries.
 */

const DropdownMenu = DropdownMenuPrimitive.Root
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger
const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup

function DropdownMenuContent({ className, sideOffset = 7, ...props }) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-40 w-[156px] rounded-[8px] border border-line-strong bg-white p-[6px]',
          'shadow-[0_10px_28px_rgba(28,45,38,.14)]',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

function DropdownMenuLabel({ className, ...props }) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn(
        'block px-[7px] pt-[5px] pb-[6px] font-mono text-micro font-semibold',
        'uppercase tracking-[.08em] text-[#8b9691]',
        className,
      )}
      {...props}
    />
  )
}

function DropdownMenuRadioItem({ className, children, ...props }) {
  return (
    <DropdownMenuPrimitive.RadioItem
      className={cn(
        'flex h-[31px] w-full cursor-pointer select-none items-center justify-between',
        'rounded-[5px] px-[7px] font-mono text-xs font-medium text-[#4e5e57] outline-none',
        'data-[highlighted]:bg-surface-2 data-[highlighted]:text-green-dark',
        'data-[state=checked]:bg-green-soft data-[state=checked]:text-green-dark',
        className,
      )}
      {...props}
    >
      {children}
      <DropdownMenuPrimitive.ItemIndicator>
        <Check size={13} />
      </DropdownMenuPrimitive.ItemIndicator>
    </DropdownMenuPrimitive.RadioItem>
  )
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
}
