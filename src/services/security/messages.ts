/**
 * English-only security presentation contract (docs/PROJECT_SPEC.md §6.5).
 *
 * Security-critical Android installation/activation/lock messages are displayed
 * in English regardless of the app language (Myanmar default). These strings
 * MUST NOT be routed through the normal Myanmar/English application-language
 * switch. Presentation contract only — the underlying security logic never
 * branches on language.
 */

/** Exact primary title of the security lock screen/dialog. */
export const SECURITY_LOCK_TITLE = 'Security Lock'

/** Device gate label while the loopback activation server waits (§6.6). */
export const WAITING_FOR_ACTIVATION = 'Waiting for activation…'

/** Error surfaced when the device-authorization check fails (fail-safe path). */
export const DEVICE_AUTH_CHECK_FAILED = 'Device authorization check failed'
