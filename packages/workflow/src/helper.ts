import { WorkflowDef } from './types.js'

export function hasCycle(workflowDef: WorkflowDef): boolean {
  const inDegree = new Map<string, number>()
  workflowDef.nodes.forEach((n) => inDegree.set(n.id, 0))

  workflowDef.edges.forEach((e) => {
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1)
  })

  const queue: string[] = []

  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id)
  }

  let visitedCount = 0
  while (queue.length > 0) {
    const id = queue.shift()!
    visitedCount++
    // for every edge outgoing from id:
    for (const e of workflowDef.edges.filter((e) => e.from === id)) {
      const to = e.to
      inDegree.set(to, (inDegree.get(to) ?? 0) - 1)
      if (inDegree.get(to) === 0) {
        queue.push(to)
      }
    }
  }

  return visitedCount !== workflowDef.nodes.length
}

export function bfsTraverse(workflowDef: WorkflowDef): void {
  const { nodes, edges, entry } = workflowDef
  const nodeById = new Map(nodes.map((n) => [n.id, n]))

  const visited = new Set<string>()
  const queue: string[] = []

  queue.push(entry)
  visited.add(entry)

  while (queue.length > 0) {
    const currentId = queue.shift()!
    const currentNode = nodeById.get(currentId)!

    // *** your “operation when specific node” check ***
    // if (shouldOperateOn(currentNode)) {
    //   performOperation(currentNode);
    // }

    //TODO: right now only printing the node-id, latter will execute the node
    console.log(currentNode.id)

    // enqueue all neighbours (i.e., edges from currentId → nextId)
    for (const e of edges) {
      if (e.from === currentId) {
        const nextId = e.to
        if (!visited.has(nextId)) {
          visited.add(nextId)
          queue.push(nextId)
        }
      }
    }
  }
}
