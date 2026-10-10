import type { ButtonHTMLAttributes, ReactNode } from 'react'
import {
  buttonClass,
  iconButtonClass,
  type ButtonSize,
  type ButtonVariant,
  type IconButtonSize,
  type IconButtonVariant,
} from './buttonStyles'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  loading?: boolean
}

export function Button({
  variant = 'tonal',
  size = 'md',
  icon,
  loading = false,
  className = '',
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={buttonClass(variant, size, className)}
      {...rest}
    >
      {loading ? <span className="ytmq-spinner h-4 w-4" aria-hidden /> : icon}
      {children}
    </button>
  )
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  variant?: IconButtonVariant
  size?: IconButtonSize
}

export function IconButton({
  label,
  variant = 'ghost',
  size = 'md',
  className = '',
  type = 'button',
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={iconButtonClass(variant, size, className)}
      {...rest}
    >
      {children}
    </button>
  )
}
