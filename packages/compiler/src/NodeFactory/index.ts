import { ExecutableNodeBase, NodeDefType, NodeType, WorkflowGlobalState } from '@mini-math/nodes'
import { IfElseNode } from './IfElse.js'
import { TriggerNode } from './Trigger.js'
import { WalletNode } from './Wallet.js'
import { PrivateKeyNode } from './PrivateKey.js'
import { TransactionNode } from './Transaction.js'
import { HttpNode } from './Http.js'
import { TransformNode } from './Transform.js'
import { ConditionNode } from './Condition.js'
import { CodeNode } from './Code.js'
import { VariableNode } from './Variable.js'
import { SmartContractNode } from './SmartContract.js'
import { CdpSmartContract } from './CdpSmartContract.js'
import { ContractRead } from './ContractRead.js'
import { CdpWalletNode } from './CdpWallet.js'
import { CdpTransactionNode } from './CdpTransaction.js'
import { TransferFundsNode } from './TransferFunds.js'
import { TestNode } from './Test.js'
import { CoinGekkoNode } from './CoinGekko.js'
import { OneInchNode } from './OneInch.js'
import { CdpSignNode } from './CdpSign.js'

export interface NodeFactoryType {
  make(node: NodeDefType, workflowGlobalStateRef: WorkflowGlobalState): ExecutableNodeBase
}
export class NodeFactory implements NodeFactoryType {
  private factory: string = 'NodeFactory'
  make(node: NodeDefType, workflowGlobalStateRef: WorkflowGlobalState): ExecutableNodeBase {
    if (node.type == NodeType.ifElse) {
      return new IfElseNode(node, workflowGlobalStateRef, this.factory)
    } else if (node.type == NodeType.trigger) {
      return new TriggerNode(node, workflowGlobalStateRef, this.factory)
    } else if (node.type == NodeType.wallet) {
      return new WalletNode(node, workflowGlobalStateRef, this.factory, 'WalletNode')
    } else if (node.type == NodeType.privateKey) {
      return new PrivateKeyNode(node, workflowGlobalStateRef, this.factory, 'PrivateKeyNode')
    } else if (node.type == NodeType.transaction) {
      return new TransactionNode(node, workflowGlobalStateRef, this.factory, 'TransactionNode')
    } else if (node.type == NodeType.http) {
      return new HttpNode(node, workflowGlobalStateRef, this.factory)
    } else if (node.type == NodeType.transform) {
      return new TransformNode(node, workflowGlobalStateRef, this.factory, 'TransformNode')
    } else if (node.type == NodeType.condition) {
      return new ConditionNode(node, workflowGlobalStateRef, this.factory, 'ConditionNode')
    } else if (node.type == NodeType.code) {
      return new CodeNode(node, workflowGlobalStateRef, this.factory)
    } else if (node.type == NodeType.variable) {
      return new VariableNode(node, workflowGlobalStateRef, this.factory)
    } else if (node.type == NodeType.smartContract) {
      return new SmartContractNode(node, workflowGlobalStateRef, this.factory, 'SmartContractNode')
    } else if (node.type == NodeType.cdpSmartContract) {
      return new CdpSmartContract(node, workflowGlobalStateRef, this.factory)
    } else if (node.type == NodeType.contractRead) {
      return new ContractRead(node, workflowGlobalStateRef, this.factory, 'ContractRead')
    } else if (node.type == NodeType.cdpWallet) {
      return new CdpWalletNode(node, workflowGlobalStateRef, this.factory)
    } else if (node.type == NodeType.cdpTransaction) {
      return new CdpTransactionNode(node, workflowGlobalStateRef, this.factory)
    } else if (node.type == NodeType.transferFunds) {
      return new TransferFundsNode(node, workflowGlobalStateRef, this.factory, 'TransferFundsNode')
    } else if (node.type == NodeType.test) {
      return new TestNode(node, workflowGlobalStateRef, this.factory)
    } else if (node.type == NodeType.coingeckoFetchPrice) {
      return new CoinGekkoNode(node, workflowGlobalStateRef, this.factory)
    } else if (node.type == NodeType.oneInchFusion) {
      return new OneInchNode(node, workflowGlobalStateRef, this.factory)
    } else if (node.type == NodeType.cdpSign) {
      return new CdpSignNode(node, workflowGlobalStateRef, this.factory)
    } else if (node.type == NodeType.decimalWallet) {
      return new CdpWalletNode(node, workflowGlobalStateRef, this.factory)
    } else if (node.type == NodeType.decimalTransaction) {
      return new CdpTransactionNode(node, workflowGlobalStateRef, this.factory)
    } else if (node.type == NodeType.eip712Sign) {
      return new CdpSignNode(node, workflowGlobalStateRef, this.factory)
    }
    throw new Error('node.type not defined')
  }
}
