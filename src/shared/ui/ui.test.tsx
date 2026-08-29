import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Text } from './Text'
import { cn } from './cn'

describe('cn', () => {
  it('joins class names and drops falsy values', () => {
    expect(cn('a', 'b')).toBe('a b')
    expect(cn('a', false, undefined, null, 'b')).toBe('a b')
    expect(cn()).toBe('')
  })
})

describe('Text semantic roles (table-readability tokens)', () => {
  it('maps roles to the semantic text-content-* token classes', () => {
    expect(renderToString(<Text>body</Text>)).toContain('text-content-body')
    expect(renderToString(<Text role="primary">p</Text>)).toContain('text-content-primary')
    expect(renderToString(<Text role="secondary">s</Text>)).toContain('text-content-secondary')
    expect(renderToString(<Text role="header">h</Text>)).toContain('text-content-header')
    expect(renderToString(<Text role="muted">m</Text>)).toContain('text-content-muted')
  })

  it('renders the requested tag and merges extra classes', () => {
    const html = renderToString(
      <Text as="th" role="header" className="px-2">
        H
      </Text>,
    )
    expect(html).toContain('<th class="text-content-header px-2">H</th>')
  })
})
