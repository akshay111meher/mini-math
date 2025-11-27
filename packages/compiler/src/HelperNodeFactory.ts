import {
  BaseNode,
  ExecutableNodeBase,
  NodeDefType,
  OutputType,
  WorkflowGlobalState,
} from '@mini-math/nodes'
import { NodeFactoryType } from './NodeFactory/index.js'

export class PrinterNode extends BaseNode {
  protected async _nodeExecutionLogic(): Promise<OutputType[]> {
    // log stuff if you still want diagnostics
    console.log('Id: ', this.nodeDef.id)
    console.log('Name: ', this.nodeDef.name)
    console.log('Input: ', this.nodeDef.inputs)
    console.log('Outputs (pre-exec): ', this.nodeDef.outputs)

    // transform inputs -> outputs
    const all_id = this.nodeDef.inputs.reduce(
      (acc, i) => (acc ? `${acc}-${i.id}` : `${i.id}`),
      `ids-${this.nodeDef.id}`,
    )
    const all_names = this.nodeDef.inputs.reduce(
      (acc, i) => (acc ? `${acc}-${i.name}` : `${i.name}`),
      `names-${this.nodeDef.name}`,
    )
    const all_type = this.nodeDef.inputs.reduce(
      (acc, i) => (acc ? `${acc}-${i.type}` : `${i.type}`),
      `types-${this.nodeDef.type}`,
    )

    return [{ id: all_id, name: all_names, type: 'string', value: all_type }]
  }

  protected async _cost(): Promise<bigint> {
    return BigInt(0)
  }
}

export class PrinterNodeFactory implements NodeFactoryType {
  make(node: NodeDefType, workflowGlobalStateRef: WorkflowGlobalState): ExecutableNodeBase {
    return new PrinterNode(node, workflowGlobalStateRef, 'PrinterNodeFactory', 'PrinterNode')
  }
}
