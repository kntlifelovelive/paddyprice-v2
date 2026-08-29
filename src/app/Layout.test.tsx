import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import { PaddyRoutes } from './router'
import { useT } from '@/shared/hooks'
import { useSettingsStore } from '@/shared/state'
import type { Settings } from '@/types'
import { rendermount } from './rendermount'

const EN_SETTINGS: Settings = {
  company_name: 'Paddy',
  company_address: '',
  company_phone: '',
  company_footer_text: '',
  tin_formula: '50',
  moisture_rates: { 17: 1, 18: 2, 19: 3, 20: 4 },
  pdf_dir: 'PSO/pdf',
  theme: 'tokyo-night',
  font_size: 'normal',
  language: 'en',
}

function renderHome(): string {
  return renderToString(
    <MemoryRouter initialEntries={['/']}>
      <PaddyRoutes />
    </MemoryRouter>,
  )
}

async function renderHomeClient(): Promise<string> {
  const r = await rendermount(
    <MemoryRouter initialEntries={['/']}>
      <PaddyRoutes />
    </MemoryRouter>,
  )
  try {
    return r.html()
  } finally {
    await r.unmount()
  }
}

describe('Layout (top-bar navigation)', () => {
  beforeEach(() => {
    useSettingsStore.setState({ settings: null, loaded: false })
  })

  it('shows the confirmed reference navigation labels in Myanmar by default', () => {
    const html = renderHome()
    for (const label of ['ပင်မ', 'အသစ်ဝယ်', 'မှတ်တမ်း', 'အစိုဓာတ်', 'အမြတ်/အရှုံး', 'လယ်သမား', 'စပါးအမျိုးအစား', 'စျေးနှုန်း', 'ဆက်တင်']) {
      expect(html).toContain(label)
    }
  })

  // Zustand v4: renderToString reads the store's initial snapshot, so the
  // English-settings test needs a live client mount (createRoot + act).
  it('renders English navigation labels when the stored language is English', async () => {
    useSettingsStore.setState({ settings: EN_SETTINGS, loaded: true })
    const html = await renderHomeClient()
    for (const label of ['Home', 'New Purchase', 'History', 'Moisture', 'P&amp;L', 'Customers', 'Paddy Types', 'Prices', 'Settings']) {
      expect(html).toContain(label)
    }
  })

  it('uses only semantic theme tokens for surfaces/text (no hard-coded white/black)', () => {
    const html = renderHome()
    expect(html).toContain('bg-surface')
    expect(html).toContain('border-border')
    expect(html).toContain('bg-background')
    expect(html).not.toContain('text-white')
    expect(html).not.toContain('text-black')
    expect(html).not.toContain('bg-neutral-')
  })

  it('marks the active route with the accent token (dashboard on /)', () => {
    const html = renderHome()
    expect(html).toContain('bg-accent')
    expect(html).toContain('text-accent-text')
  })
})

describe('useT (i18n shell wiring)', () => {
  beforeEach(() => {
    useSettingsStore.setState({ settings: null, loaded: false })
  })

  it('defaults to Myanmar when no language is stored', () => {
    function Probe() {
      const t = useT()
      return <div>{t({ my: 'ပင်မ', en: 'Home' })}</div>
    }
    expect(renderToString(<Probe />)).toContain('ပင်မ')
  })

  // Zustand v4: renderToString ignores store mutations; use live client mount.
  it('follows the stored English language', async () => {
    useSettingsStore.setState({ settings: EN_SETTINGS, loaded: true })
    function Probe() {
      const t = useT()
      return <div>{t({ my: 'ပင်မ', en: 'Home' })}</div>
    }
    const r = await rendermount(<Probe />)
    try {
      expect(r.html()).toContain('Home')
    } finally {
      await r.unmount()
    }
  })
})
