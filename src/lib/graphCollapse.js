import dagre from '@dagrejs/dagre'

/**
 * Build the directed topology used by the layout.
 *
 * Most edges already point from an earlier rank to a later one. Inheritance is
 * the exception: it is drawn child -> parent to keep the UML arrow direction,
 * while the layout ranks it parent -> child. Following the layout direction is
 * what makes "descendant" match what a reader sees below (or to the right of)
 * a node.
 */
function collapseTopology(nodes, edges) {
  const graph = new dagre.graphlib.Graph({ directed: true, multigraph: true })
  const branches = new Map()
  const nodeIds = new Set(nodes.map((item) => item.id))
  nodes.forEach((item) => graph.setNode(item.id))

  for (const item of edges) {
    if (!nodeIds.has(item.source) || !nodeIds.has(item.target) || item.source === item.target) continue
    const source = item.data?.rankReversed ? item.target : item.source
    const target = item.data?.rankReversed ? item.source : item.target
    graph.setEdge(source, target, undefined, item.id)
    branches.set(
      `${item.data?.rankReversed ? 'target' : 'source'}:${item.id}`,
      { parentId: source, childId: target },
    )
  }
  return { graph, branches }
}

/**
 * Calculate the visibility flags consumed by React Flow's native `hidden`
 * node/edge fields.
 *
 * Graphlib owns the traversal (including cycle protection), so the canvas does
 * not carry its own recursive descendant finder. Nodes remain in the complete
 * graph and keep their measured size and position while hidden.
 */
export function collapsedGraphVisibility(nodes, edges, collapsedHandleIds) {
  const { graph: topology, branches } = collapseTopology(nodes, edges)
  const branchNodeIds = new Map()

  for (const [handleId, { parentId, childId }] of branches) {
    // Removing the parent makes a branch independently collapsible even when
    // the directed model contains a cycle back to it. Graphlib still owns the
    // complete descendant traversal and its cycle protection.
    const branchTopology = topology.filterNodes((nodeId) => nodeId !== parentId)
    const nodeIds = branchTopology.hasNode(childId)
      ? dagre.graphlib.alg.preorder(branchTopology, [childId])
      : []
    branchNodeIds.set(handleId, new Set(nodeIds))
  }

  const hiddenNodeIds = new Set()
  for (const handleId of collapsedHandleIds) {
    for (const nodeId of branchNodeIds.get(handleId) || []) hiddenNodeIds.add(nodeId)
  }

  const hiddenEdgeIds = new Set(
    edges
      .filter((item) => hiddenNodeIds.has(item.source) || hiddenNodeIds.has(item.target))
      .map((item) => item.id),
  )

  return { branchNodeIds, hiddenNodeIds, hiddenEdgeIds }
}
