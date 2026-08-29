/**
 * Documented gate composition order (docs/PROJECT_SPEC.md §6.1):
 * Device Authorization → App Lock → Application.
 * Contract constant for the future `src/app` gate layer — presentation only.
 */
export const SECURITY_GATE_ORDER = ['device-authorization', 'app-lock', 'application'] as const

export type SecurityGate = (typeof SECURITY_GATE_ORDER)[number]
