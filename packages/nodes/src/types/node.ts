import z from 'zod'
import { Input, InputDefClass, InputType } from './input.js'
import { Output, OutputDefClass, OutputType } from './output.js'

export const NodeRef = z.string().min(16)

export enum NodeType {
  'ifElse',
  'trigger',
  'wallet',
  'privateKey',
  'transaction',
  'http',
  'transform',
  'condition',
  'code',
  'variable',
  'smartContract',
  'cdpSmartContract',
  'contractRead',
  'cdpWallet',
  'cdpTransaction',
  'transferFunds',
}

export const NodeDef = z.object({
  id: NodeRef,
  type: z.enum(NodeType),
  name: z.string(),
  config: z.json().default({}),
  data: z.json().optional(),
  inputs: z.array(Input).default([]),
  outputs: z.array(Output).default([]),
  executed: z.boolean().default(false),
  code: z.string().optional(),
})

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

  getName(): string {
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
