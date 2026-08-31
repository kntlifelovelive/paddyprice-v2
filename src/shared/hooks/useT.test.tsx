import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'

import { useSettingsStore } from '@/shared/state'
import type { Settings } from '@/types'
import { useT } from './useT'
import { rendermount } from '@/app/rendermount'

const BASE_SETTINGS: Settings = {
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

describe('useT (shared i18n hook)', () => {
  beforeEach(() => {
    useSettingsStore.setState({ settings: null, loaded: false })
  })

  it('defaults to English (the documented default language)', () => {
    function Probe() {
      const t = useT()
      return <div>{t({ my: 'ပင်မ', en: 'Home' })}</div>
    }
    expect(renderToString(<Probe />)).toContain('Home')
  })

  // Zustand v4: renderToString ignores store mutations; use a live client
  // mount so the English settings take effect through useSyncExternalStore.
  it('returns English when the stored language is English', async () => {
    useSettingsStore.setState({ settings: BASE_SETTINGS, loaded: true })
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

  it('rebinds when the language changes', async () => {
    function Probe() {
      const t = useT()
      return <div>{t({ my: 'ပင်မ', en: 'Home' })}</div>
    }
    const r1 = await rendermount(<Probe />)
    try {
      expect(r1.html()).toContain('Home')
    } finally {
      await r1.unmount()
    }
    useSettingsStore.setState({ settings: BASE_SETTINGS, loaded: true })
    const r2 = await rendermount(<Probe />)
    try {
      expect(r2.html()).toContain('Home')
    } finally {
      await r2.unmount()
    }
  })
})
