import { ExecutableNode, NodeDefType, NodeFactoryType } from '@mini-math/nodes'

export class PrinterNode implements ExecutableNode {
  constructor(private nodeDef: NodeDefType) {}
  async execute(): Promise<this> {
    console.log('Id: ', this.nodeDef.id)
    console.log('Name: ', this.nodeDef.name)
    console.log('Input: ', this.nodeDef.inputs)
    console.log('Outputs: ', this.nodeDef.outputs)

    return this
  }
}
export class PrinterNodeFactory implements NodeFactoryType {
  make(node: NodeDefType): PrinterNode {
    const printerNode = new PrinterNode(node)
    return printerNode
  }
}
