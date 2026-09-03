import { describe, expect, it } from 'vitest'
import { collapsedGraphVisibility } from './graphCollapse'

const node = (id) => ({ id, position: { x: 0, y: 0 }, data: {} })
const edge = (id, source, target, data = {}) => ({ id, source, target, data })

describe('collapsed graph visibility', () => {
  it('hides only the branch attached to the collapsed edge handle', () => {
    const nodes = ['root', 'left', 'grandchild', 'right', 'outside'].map(node)
    const edges = [
      edge('root-left', 'root', 'left'),
      edge('left-grandchild', 'left', 'grandchild'),
      edge('root-right', 'root', 'right'),
      edge('outside-grandchild', 'outside', 'grandchild'),
    ]

    const visibility = collapsedGraphVisibility(nodes, edges, new Set(['source:root-left']))

    expect([...visibility.hiddenNodeIds].sort()).toEqual(['grandchild', 'left'])
    expect([...visibility.hiddenEdgeIds].sort()).toEqual([
      'left-grandchild',
      'outside-grandchild',
      'root-left',
    ])
    expect(visibility.hiddenNodeIds.has('right')).toBe(false)
    expect([...visibility.branchNodeIds.get('source:root-left')].sort()).toEqual(['grandchild', 'left'])
    expect([...visibility.branchNodeIds.get('source:root-right')]).toEqual(['right'])
  })

  it('follows the visual parent-to-child direction of reversed inheritance edges', () => {
    const nodes = ['parent', 'child'].map(node)
    const edges = [edge('extends', 'child', 'parent', { rankReversed: true })]

    const visibility = collapsedGraphVisibility(nodes, edges, new Set(['target:extends']))

    expect([...visibility.hiddenNodeIds]).toEqual(['child'])
    expect([...visibility.branchNodeIds.get('target:extends')]).toEqual(['child'])
  })

  it('does not hide the parent when a collapsed branch cycles back to it', () => {
    const nodes = ['a', 'b', 'c'].map(node)
    const edges = [edge('a-b', 'a', 'b'), edge('b-c', 'b', 'c'), edge('c-a', 'c', 'a')]

    const visibility = collapsedGraphVisibility(nodes, edges, new Set(['source:a-b']))

    expect([...visibility.hiddenNodeIds].sort()).toEqual(['b', 'c'])
    expect(visibility.hiddenNodeIds.has('a')).toBe(false)
  })
})
