/**
 * Semantic text primitive — the ONLY way future table/list components should
 * render text colors. Roles map 1:1 to the `--c-text-*` semantic tokens
 * (shared/theme/tokens.css) exposed as Tailwind `text-content-*` utilities in
 * tailwind.config.js. No color is ever hard-coded here; themes remain
 * replaceable without touching components.
 */
import type { ReactNode } from 'react'
import { cn } from './cn'

export type TextRole = 'body' | 'primary' | 'secondary' | 'header' | 'muted'

const ROLE_CLASS: Record<TextRole, string> = {
  body: 'text-content-body',
  primary: 'text-content-primary',
  secondary: 'text-content-secondary',
  header: 'text-content-header',
  muted: 'text-content-muted',
}

export type TextTag = 'span' | 'p' | 'div' | 'label' | 'th' | 'td' | 'h1' | 'h2' | 'h3'

export interface TextProps {
  /** Semantic HTML tag to render. */
  as?: TextTag
  /** Semantic text role (defaults to normal body text). */
  role?: TextRole
  className?: string
  children?: ReactNode
}

export function Text({ as: Tag = 'span', role = 'body', className, children }: TextProps) {
  return <Tag className={cn(ROLE_CLASS[role], className)}>{children}</Tag>
}
