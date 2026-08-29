/**
 * Fail-safe biometric (fingerprint) unlock service on top of the platform
 * `BiometricAdapter` port (docs/PROJECT_SPEC.md §6.3).
 *
 * Never throws and never fakes support: web/desktop adapters report
 * `unsupported_platform`, and every failure degrades to a non-success result.
 * Fingerprint is the only supported modality (Face Lock is not supported).
 * The OS handles all biometric data — nothing biometric is stored in the app.
 */
import type {
  BiometricAdapter,
  BiometricAuthenticateOptions,
  BiometricCapabilities,
  BiometricResult,
  BiometricStatus,
} from '@/types'
import { SECURITY_LOCK_TITLE } from './messages'

const UNSUPPORTED: BiometricCapabilities = {
  status: 'unsupported_platform',
  fingerprint: { supported: false, enrolled: false },
}

function normalizeStatus(status: unknown): BiometricStatus {
  switch (status) {
    case 'available':
    case 'no_hardware':
    case 'not_enrolled':
    case 'temporarily_unavailable':
    case 'unsupported_platform':
      return status
    default:
      return 'unknown'
  }
}

function normalizeCapabilities(
  raw: Partial<BiometricCapabilities> | null | undefined,
): BiometricCapabilities {
  return {
    status: normalizeStatus(raw?.status),
    fingerprint: {
      supported: raw?.fingerprint?.supported === true,
      enrolled: raw?.fingerprint?.enrolled === true,
    },
  }
}

export interface BiometricService {
  /** Capability state; never throws (falls back to `unknown`/`unsupported_platform`). */
  getStatus(): Promise<BiometricCapabilities>
  /** True when the device can show a biometric prompt right now; never throws. */
  isAvailable(): Promise<boolean>
  /** Show the system prompt; never throws. English-only security title (§6.7). */
  authenticate(options?: BiometricAuthenticateOptions): Promise<BiometricResult>
  /** Open the OS enrollment screen; best-effort, never throws. */
  openEnrollment(): Promise<void>
}

export function createBiometricService(adapter: BiometricAdapter): BiometricService {
  return {
    async getStatus(): Promise<BiometricCapabilities> {
      try {
        // Normalize only — never infer support from an unknown/legacy status
        // (faking support on an unclear adapter would violate the fail-safe).
        return normalizeCapabilities(await adapter.getStatus())
      } catch {
        // Never throws, never fakes: unknown stays unknown and unsupported.
        return { ...UNSUPPORTED, status: 'unknown' as const }
      }
    },

    async isAvailable(): Promise<boolean> {
      try {
        return await adapter.isAvailable()
      } catch {
        return false
      }
    },

    async authenticate(options?: BiometricAuthenticateOptions): Promise<BiometricResult> {
      // Fail-safe: when no prompt can be shown right now (unsupported platform,
      // no hardware, not enrolled, temporarily unavailable), never fake a
      // successful authentication.
      try {
        if (!(await adapter.isAvailable())) return { success: false, cancelled: false }
      } catch {
        return { success: false, cancelled: false }
      }
      // English-only security text (§6.7): the prompt title defaults to the
      // exact `Security Lock` contract and is never routed through app i18n.
      try {
        const result = await adapter.authenticate({
          title: options?.title ?? SECURITY_LOCK_TITLE,
          subtitle: options?.subtitle,
          cancelLabel: options?.cancelLabel ?? 'Cancel',
        })
        return { success: result?.success === true, cancelled: result?.cancelled === true }
      } catch {
        // Rejected before the prompt or a native error — never throws.
        return { success: false, cancelled: false }
      }
    },

    async openEnrollment(): Promise<void> {
      try {
        await adapter.openEnrollment()
      } catch {
        // Fail-safe: opening the enrollment screen is best-effort.
      }
    },
  }
}
