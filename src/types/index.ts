/**
 * src/types entry — type-only contracts (bottom layer).
 *
 * Re-exports the app-level data contracts and infrastructure ports so other
 * layers can `import type { ... } from '@/types'`.
 */

export * from './entities'
export * from './storage'
export * from './print'
export * from './platform'
export * from './security'
export * from './pdf'

// Ports are re-exported for convenience; infrastructure implements them,
// services/features consume them — always as types.
export type {
  DbPersistenceAdapter,
  PurchaseRecord,
  PurchaseDaoPort,
} from './ports'