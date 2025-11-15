import { PrinterNodeFactory } from '@mini-math/compiler'
import { Workflow, WorkflowDef } from '@mini-math/workflow'
import { basicProgramJson } from './basic.js'
import { EdgeDefType, NodeDefType, NodeType } from '@mini-math/nodes'

const nodes: NodeDefType[] = basicProgramJson.nodes.map((a) => {
  return {
    id: a.id,
    // TODO: update this
    type: NodeType.ifElse,
    name: 'code',
    config: {},
    data: {},
    inputs: a.inputs,
    outputs: a.outputs,
    executed: false,
  }
})
const edges: EdgeDefType[] = basicProgramJson.connections.map((a) => {
  return {
    from: a.source.nodeId,
    to: a.target.nodeId,
    id: a.id,
  }
})

const workflowJson: WorkflowDef = {
  id: basicProgramJson.id,
  name: basicProgramJson.name,
  version: '0.1.0',
  nodes,
  edges,
  entry: basicProgramJson.nodes[0].id,
  owner: '0xabcdabcdabcdabcdabcdabcdabcdabcdabcdabcd',
}

const printerNodeFactory = new PrinterNodeFactory()

let workflow = new Workflow(workflowJson, printerNodeFactory)

async function run() {
  while (!workflow.isFinished()) {
    const info = await workflow.clock()

    console.log(JSON.stringify(info, null, 2))
    const [wf, rt] = workflow.serialize()

    workflow = new Workflow(wf, printerNodeFactory, rt)
  }

  return 'Done Workflow Execution'
}

run().then(console.log).catch(console.error)
