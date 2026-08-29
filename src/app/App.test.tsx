import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import App from './App'

describe('App (foundation smoke test)', () => {
  it('renders the startup placeholder', () => {
    const html = renderToString(<App />)

    expect(html).toContain('Paddy')
  })
})
