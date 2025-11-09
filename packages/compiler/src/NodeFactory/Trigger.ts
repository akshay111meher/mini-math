import { BaseNode, OutputType, NodeDefType, WorkflowGlobalState } from '@mini-math/nodes'
import { makeLogger, Logger } from '@mini-math/logger'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'

const TriggerConfigSchema = z.object({
  triggerType: z.string().optional(),
})
type TriggerConfig = z.infer<typeof TriggerConfigSchema>

export class TriggerNode extends BaseNode {
  private readonly logger: Logger
  constructor(nodeDef: NodeDefType, workflowGlobalStateRef: WorkflowGlobalState) {
    super(nodeDef, workflowGlobalStateRef)
    this.logger = makeLogger(`TriggerNode: ${this.nodeDef.id}`)
  }

  protected async _nodeExecutionLogic(): Promise<OutputType[]> {
    this.logger.debug('Started trigger node execution')
    const raw: unknown = this.nodeDef.data ?? this.nodeDef.config ?? {}
    const nodeConfig: TriggerConfig = TriggerConfigSchema.parse(raw)

    this.logger.info(`Executing trigger node ${this.nodeDef.id}`, {
      inputData: this.readInputs(),
      triggerType: nodeConfig.triggerType,
    })

    const out: Extract<OutputType, { type: 'boolean' }> = {
      id: uuidv4(),
      name: 'trigger',
      type: 'boolean',
      value: true,
    }

    return [out]
  }
  protected async _cost(): Promise<bigint> {
    return BigInt(14)
  }
}
