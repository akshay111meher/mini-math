import { ExecutableNodeBase, NodeDefType, NodeFactoryType, NodeType } from '@mini-math/nodes'
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

export class NodeFactory implements NodeFactoryType {
  make(node: NodeDefType): ExecutableNodeBase {
    if (node.type == NodeType.ifElse) {
      return new IfElseNode(node)
    } else if (node.type == NodeType.trigger) {
      return new TriggerNode(node)
    } else if (node.type == NodeType.wallet) {
      return new WalletNode(node)
    } else if (node.type == NodeType.privateKey) {
      return new PrivateKeyNode(node)
    } else if (node.type == NodeType.transaction) {
      return new TransactionNode(node)
    } else if (node.type == NodeType.http) {
      return new HttpNode(node)
    } else if (node.type == NodeType.transform) {
      return new TransformNode(node)
    } else if (node.type == NodeType.condition) {
      return new ConditionNode(node)
    } else if (node.type == NodeType.code) {
      return new CodeNode(node)
    } else if (node.type == NodeType.variable) {
      return new VariableNode(node)
    } else if (node.type == NodeType.smartContract) {
      return new SmartContractNode(node)
    } else if (node.type == NodeType.cdpSmartContract) {
      return new CdpSmartContract(node)
    } else if (node.type == NodeType.contractRead) {
      return new ContractRead(node)
    } else if (node.type == NodeType.cdpWallet) {
      return new CdpWalletNode(node)
    } else if (node.type == NodeType.cdpTransaction) {
      return new CdpTransactionNode(node)
    } else if (node.type == NodeType.transferFunds) {
      return new TransferFundsNode(node)
    }
    throw new Error('node.type not defined')
  }
}
