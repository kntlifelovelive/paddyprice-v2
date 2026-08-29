/**
 * Tiny class-name helper (framework-light, no dependencies).
 * Filters falsy values and joins the rest with spaces.
 */
export type ClassValue = string | number | false | null | undefined

export function cn(...classes: ClassValue[]): string {
  return classes.filter((c) => typeof c === 'string' || typeof c === 'number').join(' ')
}
