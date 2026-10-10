/**
 * The one set of buttons the app uses. Every button is a pill; size sets the
 * height, never the width, so nothing stretches across a card unless a
 * layout asks for it.
 */
export type ButtonVariant = 'primary' | 'accent' | 'tonal' | 'outline' | 'ghost' | 'danger' | 'spotify'
export type ButtonSize = 'sm' | 'md' | 'lg'

const BASE =
  'ytmq-press inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold disabled:pointer-events-none disabled:opacity-40'

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3.5 text-[13px]',
  md: 'h-10 px-5 text-sm',
  lg: 'h-12 px-6 text-[15px]',
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-white text-neutral-950 hover:bg-neutral-200',
  accent: 'bg-accent-600 text-white hover:bg-accent-500',
  tonal: 'bg-white/[0.08] text-white hover:bg-white/[0.14]',
  outline: 'text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.22)] hover:bg-white/[0.05] hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.4)]',
  ghost: 'text-neutral-300 hover:bg-white/[0.06] hover:text-white',
  danger: 'text-accent-300 shadow-[inset_0_0_0_1px_rgba(245,73,47,0.45)] hover:bg-accent-500/10',
  spotify: 'bg-[#1ed760] text-black hover:bg-[#3be477]',
}

export function buttonClass(variant: ButtonVariant = 'tonal', size: ButtonSize = 'md', extra = '') {
  return `${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${extra}`
}

export type IconButtonSize = 'sm' | 'md' | 'lg'

const ICON_SIZES: Record<IconButtonSize, string> = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
}

const ICON_VARIANTS = {
  ghost: 'text-neutral-300 hover:bg-white/[0.08] hover:text-white',
  tonal: 'bg-white/[0.08] text-white hover:bg-white/[0.14]',
  primary: 'bg-white text-neutral-950 hover:bg-neutral-200',
  accent: 'bg-accent-600 text-white hover:bg-accent-500',
  glass: 'bg-black/35 text-white backdrop-blur-md hover:bg-black/55',
} as const

export type IconButtonVariant = keyof typeof ICON_VARIANTS

export function iconButtonClass(variant: IconButtonVariant = 'ghost', size: IconButtonSize = 'md', extra = '') {
  return `ytmq-press inline-flex shrink-0 select-none items-center justify-center rounded-full disabled:pointer-events-none disabled:opacity-40 ${ICON_SIZES[size]} ${ICON_VARIANTS[variant]} ${extra}`
}

