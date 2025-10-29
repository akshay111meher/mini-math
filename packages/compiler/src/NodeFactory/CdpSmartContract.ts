import { BaseNode, OutputType } from '@mini-math/nodes'

export class CdpSmartContract extends BaseNode {
  protected async _nodeExecutionLogic(): Promise<OutputType[]> {
    throw new Error('method not implemented')
  }
  async cost(): Promise<BigInt> {
    return BigInt(1)
  }
}
