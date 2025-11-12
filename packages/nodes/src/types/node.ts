import z from 'zod'
import { Input, InputDefClass, InputType } from './input.js'
import { Output, OutputDefClass, OutputType } from './output.js'

export const NodeRef = z.string().min(16)

export enum NodeType {
  ifElse = 'ifElse',
  trigger = 'trigger',
  wallet = 'wallet',
  privateKey = 'privateKey',
  transaction = 'transaction',
  http = 'http',
  transform = 'transform',
  condition = 'condition',
  code = 'code',
  variable = 'variable',
  smartContract = 'smartContract',
  cdpSmartContract = 'cdpSmartContract',
  contractRead = 'contractRead',
  cdpWallet = 'cdpWallet',
  cdpTransaction = 'cdpTransaction',
  transferFunds = 'transferFunds',
  test = 'test',
  coingeckoFetchPrice = 'coingeckoFetchPrice',
}

export const ExecutionTimestamp = z.number().int().nonnegative().brand<'UnixEpochMs'>()
export const NodeDef = z
  .object({
    id: NodeRef,
    type: z.enum(NodeType),
    name: z.string().optional(),
    config: z.unknown().optional(),
    data: z.unknown().optional(),
    inputs: z.array(Input).default([]),
    outputs: z.array(Output).default([]),
    executed: z.boolean().default(false),
    executionTimestamp: ExecutionTimestamp.optional(),
    code: z.string().optional(),
  })
  .openapi('Node')

export type NodeDefType = z.infer<typeof NodeDef>

export class NodeDefClass {
  protected nodeDef: NodeDefType

  constructor(nodeDef: NodeDefType) {
    this.nodeDef = nodeDef
  }

  // Scalars / simple fields
  getId(): string {
    return this.nodeDef.id
  }

  getType(): NodeType {
    return this.nodeDef.type
  }

  getName(): string | undefined {
    return this.nodeDef.name
  }

  getConfig(): unknown {
    return this.nodeDef.config
  }

  getData(): unknown | undefined {
    return this.nodeDef.data
  }

  isExecuted(): boolean {
    return this.nodeDef.executed
  }

  getCode(): string | undefined {
    return this.nodeDef.code
  }

  getInputs(): InputDefClass[] {
    return this.nodeDef.inputs.map((i: InputType) => new InputDefClass(i))
  }

  getOutputs(): OutputDefClass[] {
    return this.nodeDef.outputs.map((o: OutputType) => new OutputDefClass(o))
  }

  // Optional: whole-object accessor
  getAll(): NodeDefType {
    return this.nodeDef
  }
}
