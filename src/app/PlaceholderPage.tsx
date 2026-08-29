/**
 * Temporary feature placeholder — used by the Step-8 route table until each
 * feature page is implemented in its own step.
 *
 * Structurally simple and deliberately empty of business content: no fake
 * data, calculations, tables, or statistics. Only a semantic page title and a
 * "not implemented" note (English-only — placeholder scaffolding is not part
 * of the bilingual product UI and no translation content is invented here).
 *
 * All colors are semantic tokens — never hard-coded business colors.
 */
import { Text } from '@/shared/ui'

export interface PlaceholderPageProps {
  /** Stable identifier used by tests / debugging. */
  page: string
  /** Page title (English label for the scaffolding placeholder). */
  title: string
}

export function FeaturePlaceholder({ page, title }: PlaceholderPageProps) {
  return (
    <section
      data-page={page}
      className="mx-auto w-full max-w-4xl rounded-xl border border-border bg-surface p-6 sm:p-8"
    >
      <Text as="h1" role="header" className="mb-1 text-xl font-semibold">
        {title}
      </Text>
      <Text role="secondary" className="text-sm">
        Not implemented yet — this feature’s page arrives in a later step.
      </Text>
    </section>
  )
}