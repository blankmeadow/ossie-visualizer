import { describe, expect, it } from 'vitest'
import { topLevelContainerRanges } from './json'

describe('JSON viewer helpers', () => {
  it('returns only direct child containers of the root object', () => {
    const source = JSON.stringify({ name: 'demo', context: { nested: { value: 1 } }, items: [{ id: 1 }] }, null, 2)
    const folded = topLevelContainerRanges(source).map(({ from, to }) => source.slice(from, to))

    expect(folded).toHaveLength(2)
    expect(folded[0]).toContain('"nested"')
    expect(folded[1]).toContain('"id"')
  })

  it('ignores braces and escaped quotes inside strings', () => {
    const source = JSON.stringify({ note: 'value with { braces } and "quotes"', config: { enabled: true } }, null, 2)
    const ranges = topLevelContainerRanges(source)

    expect(ranges).toHaveLength(1)
    expect(source.slice(ranges[0].from, ranges[0].to)).toContain('"enabled": true')
  })
})
